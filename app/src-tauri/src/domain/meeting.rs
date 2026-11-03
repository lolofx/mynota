//! The `Meeting` aggregate: a single recorded, transcribed, and summarized
//! session.
//!
//! Every mutation returns a new `Meeting` rather than mutating in place —
//! there are no `&mut self` setters on this type.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::domain::folder::FolderId;
use crate::domain::summary::SummaryRef;

/// Stable identifier for a [`Meeting`].
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct MeetingId(Uuid);

impl MeetingId {
    /// Generates a new, random meeting id.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for MeetingId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for MeetingId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl FromStr for MeetingId {
    type Err = uuid::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Uuid::from_str(s).map(Self)
    }
}

/// A recorded meeting: audio, transcript, and any generated summaries.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Meeting {
    pub id: MeetingId,
    pub title: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    pub duration_sec: f32,
    pub audio_path: Option<PathBuf>,
    pub transcript: Option<myna_stt::Transcript>,
    pub summaries: Vec<SummaryRef>,
    #[serde(default)]
    pub archived: bool,
    /// Count of audio chunks silently dropped during recording because the
    /// decode handoff channel was full (see
    /// `crate::session::DecodeChannel`). Non-zero means the transcript may
    /// be missing audio even though the recording itself is intact — the
    /// signal that lets the app proactively offer a re-transcribe. Reset to
    /// `0` by a successful re-transcribe. Defaults to `0` when
    /// deserializing a `meeting.json` written before this field existed.
    #[serde(default)]
    pub dropped_audio_chunks: u32,
    /// The folder this meeting is filed under, if any. `#[serde(default)]`
    /// is load-bearing: without it, a `meeting.json` written before the
    /// folders feature existed (no `folder_id` key at all) fails to
    /// deserialize, and `FsMeetingStore::list`'s `.ok()` silently drops it
    /// from the sidebar. Never validated against the folder store — a
    /// folder id naming a folder that no longer exists is legal.
    #[serde(default)]
    pub folder_id: Option<FolderId>,
    /// Explicit manual-ordering rank, or `None` when the meeting has never
    /// been dragged into a specific spot -- see
    /// `crate::domain::placement::effective_position` for how an unplaced
    /// meeting still sorts. `#[serde(default)]` is load-bearing here too:
    /// without it, a `meeting.json` written before manual ordering existed
    /// (no `position` key at all) fails to deserialize, and
    /// `FsMeetingStore::list`'s `.ok()` silently drops it from the sidebar.
    #[serde(default)]
    pub position: Option<f64>,
    /// Display names for speaker labels (e.g. `"others:1"` -> `"Jean"`),
    /// keyed by the label stored on each `TranscriptSegment`. Never embedded
    /// into segment labels themselves, to avoid silent data loss via the
    /// `is_well_formed` validation gate. `#[serde(default)]` is
    /// load-bearing: without it, a `meeting.json` written before speaker
    /// naming existed (no `speaker_names` key at all) fails to deserialize,
    /// and `FsMeetingStore::list`'s `.ok()` silently drops it from the
    /// sidebar.
    #[serde(default)]
    pub speaker_names: BTreeMap<String, String>,
    /// Path of this meeting's exported Markdown file, relative to the export
    /// folder (`/`-separated). `None` until the first export. Lets a re-export
    /// write to the same file after a rename, and lets the app tell a moved
    /// file from a missing one (ADR 0022). `#[serde(default)]` keeps older
    /// `meeting.json` files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub export_path: Option<String>,
    /// Whether the audio files were removed to free disk space (ADR 0022).
    /// The transcript, summaries, notes and export are kept; re-transcribing
    /// or detecting speakers is no longer possible. `#[serde(default)]` keeps
    /// older `meeting.json` files loading.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub audio_purged: bool,
    /// Language spoken in the meeting, as one of [`AUDIO_LANGUAGES`], or
    /// `None` when unknown or mixed. The speech model cannot be pinned to a
    /// language; this drives the check that flags segments decoded in the
    /// wrong one and the exported `language` field. `#[serde(default)]` keeps
    /// older `meeting.json` files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_language: Option<String>,
    /// How many people speak on the remote side, when the user said so before
    /// recording. Pins the cluster count of speaker detection instead of
    /// letting it guess. `#[serde(default)]` keeps older files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_speakers: Option<u8>,
}

/// Languages a meeting can be tagged with (ISO 639-1), all handled by the
/// speech model.
pub const AUDIO_LANGUAGES: &[&str] = &["fr", "en", "de", "es", "it", "nl", "pt"];

/// Fewest and most remote speakers the user can announce.
pub const EXPECTED_SPEAKERS_MIN: u8 = 1;
pub const EXPECTED_SPEAKERS_MAX: u8 = 12;

/// Keeps `language` when it is one of [`AUDIO_LANGUAGES`] (any case, trimmed);
/// anything else, including `auto`, means "not specified".
pub fn normalize_audio_language(language: Option<&str>) -> Option<String> {
    let code = language?.trim().to_ascii_lowercase();
    AUDIO_LANGUAGES.contains(&code.as_str()).then_some(code)
}

/// Keeps `speakers` when it lies in
/// [`EXPECTED_SPEAKERS_MIN`]..=[`EXPECTED_SPEAKERS_MAX`]; anything else means
/// "not specified".
pub fn normalize_expected_speakers(speakers: Option<u8>) -> Option<u8> {
    speakers.filter(|count| (EXPECTED_SPEAKERS_MIN..=EXPECTED_SPEAKERS_MAX).contains(count))
}

impl Meeting {
    /// Creates a new, empty meeting with a fresh id and the current time.
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            id: MeetingId::new(),
            title: title.into(),
            created_at: OffsetDateTime::now_utc(),
            duration_sec: 0.0,
            audio_path: None,
            transcript: None,
            summaries: Vec::new(),
            archived: false,
            dropped_audio_chunks: 0,
            folder_id: None,
            position: None,
            speaker_names: BTreeMap::new(),
            export_path: None,
            audio_purged: false,
            audio_language: None,
            expected_speakers: None,
        }
    }

    /// Returns a copy of this meeting with the language and the remote
    /// speaker count replaced. Values outside the allowed sets are dropped
    /// (see [`normalize_audio_language`], [`normalize_expected_speakers`]).
    pub fn with_capture_hints(&self, language: Option<&str>, speakers: Option<u8>) -> Self {
        Self {
            audio_language: normalize_audio_language(language),
            expected_speakers: normalize_expected_speakers(speakers),
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `export_path` replaced. `None`
    /// forgets the link without touching the file.
    pub fn with_export_path(&self, export_path: Option<String>) -> Self {
        Self {
            export_path,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `audio_purged` replaced. Purging
    /// also forgets `audio_path`, which points at a file that is gone.
    pub fn with_audio_purged(&self, audio_purged: bool) -> Self {
        Self {
            audio_purged,
            audio_path: if audio_purged {
                None
            } else {
                self.audio_path.clone()
            },
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `transcript` replaced.
    pub fn with_transcript(&self, transcript: myna_stt::Transcript) -> Self {
        Self {
            transcript: Some(transcript),
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `summary` upserted into its
    /// summary list: an existing entry with the same `(template, language)`
    /// pair is replaced, otherwise `summary` is appended. Every other
    /// summary is left untouched.
    pub fn with_summary(&self, summary: SummaryRef) -> Self {
        let mut summaries: Vec<SummaryRef> = self
            .summaries
            .iter()
            .filter(|existing| {
                !(existing.template == summary.template && existing.language == summary.language)
            })
            .cloned()
            .collect();
        summaries.push(summary);
        Self {
            summaries,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with the summary matching the
    /// `(template, language)` pair removed. Every other summary is left
    /// untouched; when no entry matches, the copy is identical.
    pub fn without_summary(&self, template: &str, language: &str) -> Self {
        Self {
            summaries: self
                .summaries
                .iter()
                .filter(|existing| {
                    !(existing.template == template && existing.language == language)
                })
                .cloned()
                .collect(),
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `duration_sec` replaced.
    pub fn with_duration(&self, duration_sec: f32) -> Self {
        Self {
            duration_sec,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `title` replaced.
    pub fn with_title(&self, title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `audio_path` replaced.
    pub fn with_audio_path(&self, audio_path: PathBuf) -> Self {
        Self {
            audio_path: Some(audio_path),
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `archived` replaced.
    pub fn with_archived(&self, archived: bool) -> Self {
        Self {
            archived,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `dropped_audio_chunks` replaced.
    pub fn with_dropped_audio_chunks(&self, dropped_audio_chunks: u32) -> Self {
        Self {
            dropped_audio_chunks,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `folder_id` replaced. Accepts
    /// `None` to unassign the meeting from any folder. Never validates
    /// `folder_id` against the folder store — see the field docs on
    /// [`Meeting::folder_id`].
    pub fn with_folder(&self, folder_id: Option<FolderId>) -> Meeting {
        Meeting {
            folder_id,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `position` replaced. Accepts
    /// `None` to clear an explicit position, falling back to the
    /// `created_at`-derived rank -- see
    /// `crate::domain::placement::effective_position`.
    pub fn with_position(&self, position: Option<f64>) -> Meeting {
        Meeting {
            position,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with `speaker_names` replaced. Passing
    /// an empty map clears every display name — used after a re-transcribe,
    /// which invalidates the old speaker clustering (see the module docs on
    /// [`Meeting::speaker_names`]).
    pub fn with_speaker_names(&self, speaker_names: BTreeMap<String, String>) -> Meeting {
        Meeting {
            speaker_names,
            ..self.clone()
        }
    }

    /// Returns a copy of this meeting with every existing summary's `stale`
    /// flag set to `true` — used when a fresh transcript (from a
    /// re-transcribe) invalidates every summary generated from the old one.
    /// Never removes a summary; only flips the flag, so the markdown stays
    /// reachable on disk.
    pub fn with_all_summaries_stale(&self) -> Self {
        Self {
            summaries: self
                .summaries
                .iter()
                .map(|summary| summary.with_stale(true))
                .collect(),
            ..self.clone()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_known_language_is_kept_in_lowercase() {
        assert_eq!(normalize_audio_language(Some(" FR ")), Some("fr".into()));
        assert_eq!(normalize_audio_language(Some("en")), Some("en".into()));
    }

    #[test]
    fn auto_unknown_and_empty_languages_mean_not_specified() {
        assert_eq!(normalize_audio_language(Some("auto")), None);
        assert_eq!(normalize_audio_language(Some("klingon")), None);
        assert_eq!(normalize_audio_language(Some("")), None);
        assert_eq!(normalize_audio_language(None), None);
    }

    #[test]
    fn the_speaker_count_must_lie_in_the_allowed_range() {
        assert_eq!(normalize_expected_speakers(Some(0)), None);
        assert_eq!(normalize_expected_speakers(Some(1)), Some(1));
        assert_eq!(normalize_expected_speakers(Some(12)), Some(12));
        assert_eq!(normalize_expected_speakers(Some(13)), None);
        assert_eq!(normalize_expected_speakers(None), None);
    }

    #[test]
    fn capture_hints_are_set_through_the_normalizers() {
        let meeting = Meeting::new("Weekly").with_capture_hints(Some("FR"), Some(40));

        assert_eq!(meeting.audio_language.as_deref(), Some("fr"));
        assert_eq!(meeting.expected_speakers, None);
    }

    #[test]
    fn an_older_meeting_file_without_the_hints_still_loads() {
        let meeting = Meeting::new("Old");
        let mut json = serde_json::to_value(&meeting).expect("serialize");
        let object = json.as_object_mut().expect("object");
        object.remove("audio_language");
        object.remove("expected_speakers");

        let loaded: Meeting = serde_json::from_value(json).expect("deserialize");

        assert_eq!(loaded.audio_language, None);
        assert_eq!(loaded.expected_speakers, None);
    }

    #[test]
    fn unset_hints_are_not_written_to_the_file() {
        let json = serde_json::to_value(Meeting::new("Plain")).expect("serialize");

        assert!(json.get("audio_language").is_none());
        assert!(json.get("expected_speakers").is_none());
    }
}
