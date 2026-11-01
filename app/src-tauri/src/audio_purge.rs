//! Freeing the disk space of a meeting's audio while keeping everything else
//! (ADR 0022). The audio is the heavy part of a meeting; the transcript,
//! summaries, notes and export stay.
//!
//! A purge is irreversible, so it only runs on a meeting that has a
//! transcript, is not being recorded, and still has audio.

use time::{Duration, OffsetDateTime};

use crate::domain::{Meeting, MeetingId};
use crate::error::AppError;
use crate::store::MeetingStore;

/// A meeting whose audio could be purged, with what it would free.
#[derive(Debug, Clone, PartialEq)]
pub struct PurgeCandidate {
    pub id: MeetingId,
    pub title: String,
    pub bytes: u64,
}

/// What a meeting's audio looks like to the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioUsage {
    /// Size of the audio files still on disk.
    pub bytes: u64,
    /// Whether the audio was purged before.
    pub purged: bool,
    /// Whether a purge is allowed now.
    pub can_purge: bool,
}

fn has_transcript(meeting: &Meeting) -> bool {
    meeting
        .transcript
        .as_ref()
        .is_some_and(|transcript| !transcript.segments.is_empty())
}

/// Reads the audio state of `id`. `active` is the meeting being recorded.
pub fn usage(
    store: &dyn MeetingStore,
    id: MeetingId,
    active: Option<MeetingId>,
) -> Result<AudioUsage, AppError> {
    let meeting = store.get(id)?;
    let bytes = store.audio_bytes(id)?;
    Ok(AudioUsage {
        bytes,
        purged: meeting.audio_purged,
        can_purge: bytes > 0 && has_transcript(&meeting) && active != Some(id),
    })
}

/// Removes the audio of `id` and returns the bytes freed.
pub fn purge(
    store: &dyn MeetingStore,
    id: MeetingId,
    active: Option<MeetingId>,
) -> Result<u64, AppError> {
    let meeting = store.get(id)?;
    if active == Some(id) {
        return Err(AppError::Busy(
            "cannot purge the audio of the meeting being recorded",
        ));
    }
    if !has_transcript(&meeting) {
        return Err(AppError::Store(
            "the audio is kept until the meeting has a transcript".to_string(),
        ));
    }
    let freed = store.purge_audio(id)?;
    store.save(&meeting.with_audio_purged(true))?;
    Ok(freed)
}

/// Meetings with a transcript and audio on disk, created more than
/// `older_than_days` days before `now`, oldest first.
pub fn candidates(
    store: &dyn MeetingStore,
    older_than_days: u32,
    now: OffsetDateTime,
    active: Option<MeetingId>,
) -> Result<Vec<PurgeCandidate>, AppError> {
    let limit = now - Duration::days(i64::from(older_than_days));
    let mut found = Vec::new();
    for meeting in store.list()? {
        if meeting.created_at > limit || active == Some(meeting.id) || !has_transcript(&meeting) {
            continue;
        }
        let bytes = store.audio_bytes(meeting.id).unwrap_or(0);
        if bytes > 0 {
            found.push((
                meeting.created_at,
                PurgeCandidate {
                    id: meeting.id,
                    title: meeting.title.clone(),
                    bytes,
                },
            ));
        }
    }
    found.sort_by_key(|(created, _)| *created);
    Ok(found.into_iter().map(|(_, candidate)| candidate).collect())
}

/// Purges every candidate of [`candidates`]; returns `(meetings, bytes)`. A
/// meeting that fails is skipped, the others go on.
pub fn purge_older_than(
    store: &dyn MeetingStore,
    older_than_days: u32,
    now: OffsetDateTime,
    active: Option<MeetingId>,
) -> Result<(usize, u64), AppError> {
    let mut count = 0;
    let mut freed = 0;
    for candidate in candidates(store, older_than_days, now, active)? {
        if let Ok(bytes) = purge(store, candidate.id, active) {
            count += 1;
            freed += bytes;
        }
    }
    Ok((count, freed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::fs_store::FsMeetingStore;
    use myna_stt::{Speaker, Transcript, TranscriptSegment};

    fn segment() -> TranscriptSegment {
        TranscriptSegment {
            start_sec: 0.0,
            end_sec: 1.0,
            text: "Bonjour.".to_string(),
            speaker: Speaker::me(),
            speaker_pinned: false,
            suspect_reasons: Vec::new(),
            original_text: None,
            edited: false,
        }
    }

    fn meeting_with_audio(store: &FsMeetingStore, transcript: bool, age_days: i64) -> Meeting {
        let created = store.create("Point").expect("create");
        let mut meeting = Meeting {
            created_at: OffsetDateTime::now_utc() - Duration::days(age_days),
            ..created
        };
        if transcript {
            meeting = meeting.with_transcript(Transcript {
                segments: vec![segment()],
            });
        }
        store.save(&meeting).expect("save");
        std::fs::write(store.audio_path(meeting.id), vec![0u8; 1000]).expect("audio");
        std::fs::write(store.mic_track_path(meeting.id), vec![0u8; 200]).expect("mic");
        meeting
    }

    #[test]
    fn a_purge_frees_the_audio_and_keeps_the_rest() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = meeting_with_audio(&store, true, 0);
        store.write_notes(meeting.id, "mine").expect("notes");
        store
            .save_summary(meeting.id, "key-points", "en", "# S")
            .expect("summary");

        let freed = purge(&store, meeting.id, None).expect("purge");

        assert_eq!(freed, 1200);
        assert_eq!(store.audio_bytes(meeting.id).expect("bytes"), 0);
        let after = store.get(meeting.id).expect("get");
        assert!(after.audio_purged);
        assert!(after.transcript.is_some());
        assert_eq!(store.read_notes(meeting.id).expect("notes"), "mine");
        assert!(store.read_summary(meeting.id, "key-points", "en").is_ok());
    }

    #[test]
    fn a_meeting_without_transcript_or_being_recorded_is_refused_and_keeps_its_audio() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let bare = meeting_with_audio(&store, false, 0);
        let live = meeting_with_audio(&store, true, 0);

        assert!(purge(&store, bare.id, None).is_err());
        assert!(matches!(
            purge(&store, live.id, Some(live.id)),
            Err(AppError::Busy(_))
        ));
        assert_eq!(store.audio_bytes(bare.id).expect("bytes"), 1200);
        assert_eq!(store.audio_bytes(live.id).expect("bytes"), 1200);
        assert!(!store.get(live.id).expect("get").audio_purged);
    }

    #[test]
    fn usage_tells_when_a_purge_is_allowed() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let ok = meeting_with_audio(&store, true, 0);
        let bare = meeting_with_audio(&store, false, 0);

        assert_eq!(
            usage(&store, ok.id, None).expect("usage"),
            AudioUsage {
                bytes: 1200,
                purged: false,
                can_purge: true
            }
        );
        assert!(!usage(&store, bare.id, None).expect("usage").can_purge);
        assert!(!usage(&store, ok.id, Some(ok.id)).expect("usage").can_purge);

        purge(&store, ok.id, None).expect("purge");
        let after = usage(&store, ok.id, None).expect("usage");
        assert!(after.purged && !after.can_purge && after.bytes == 0);
    }

    #[test]
    fn the_bulk_purge_counts_first_and_only_takes_old_transcribed_meetings() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let old = meeting_with_audio(&store, true, 90);
        let _recent = meeting_with_audio(&store, true, 3);
        let _untranscribed = meeting_with_audio(&store, false, 90);
        let now = OffsetDateTime::now_utc();

        let found = candidates(&store, 30, now, None).expect("candidates");
        assert_eq!(found.iter().map(|c| c.id).collect::<Vec<_>>(), [old.id]);
        assert_eq!(found[0].bytes, 1200);

        let (count, bytes) = purge_older_than(&store, 30, now, None).expect("bulk");
        assert_eq!((count, bytes), (1, 1200));
        assert!(candidates(&store, 30, now, None).expect("again").is_empty());
    }

    #[test]
    fn an_old_meeting_json_has_no_purge_flag_and_loads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = meeting_with_audio(&store, true, 0);
        assert!(!store.get(meeting.id).expect("get").audio_purged);
    }
}
