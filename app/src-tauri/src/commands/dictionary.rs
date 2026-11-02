//! The user's vocabulary (see [`crate::dictionary`]): stored in
//! `<data_root>/preferences.json` under the `"dictionary"` key, applied to
//! every new transcript, applicable to the meetings already there, and
//! handed to the summaries as terms to respect.

use std::fs;
use std::path::Path;

use myna_stt::Transcript;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::commands::recording::lock_session;
use crate::dictionary::Dictionary;
use crate::error::AppError;
use crate::paths;
use crate::state::AppState;
use crate::store::MeetingStore;

const PREFERENCES_FILE: &str = "preferences.json";
const DICTIONARY_KEY: &str = "dictionary";

/// Longest dictionary text kept, in characters.
const MAX_TEXT_CHARS: usize = 20_000;

/// Reads the dictionary text. Never fails: a missing or corrupt file is an
/// empty dictionary.
pub fn load_text(root: &Path) -> String {
    fs::read_to_string(root.join(PREFERENCES_FILE))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| {
            value
                .get(DICTIONARY_KEY)?
                .get("text")?
                .as_str()
                .map(str::to_string)
        })
        .unwrap_or_default()
}

/// Stores the dictionary text, keeping every other preference.
pub fn save_text(root: &Path, text: &str) -> Result<(), AppError> {
    let path = root.join(PREFERENCES_FILE);
    let mut map = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default();
    map.insert(DICTIONARY_KEY.to_string(), json!({ "text": text }));
    paths::create_dir_all_0700(root)?;
    let json = serde_json::to_string_pretty(&Value::Object(map))
        .map_err(|err| AppError::Store(err.to_string()))?;
    paths::write_0600(&path, json.as_bytes())?;
    Ok(())
}

/// The dictionary in force, empty when none is set or the data folder cannot
/// be resolved.
pub fn current() -> Dictionary {
    paths::data_root()
        .map(|root| Dictionary::parse(&load_text(&root)))
        .unwrap_or_default()
}

/// `transcript` with the dictionary applied; a corrected segment keeps what
/// was heard in `original_text` and counts as edited, like a hand correction.
pub fn apply_to_transcript(transcript: Transcript, dictionary: &Dictionary) -> (Transcript, usize) {
    let mut changed = 0;
    let segments = transcript
        .segments
        .into_iter()
        .map(|mut segment| {
            let fixed = dictionary.apply(&segment.text);
            if fixed != segment.text {
                segment
                    .original_text
                    .get_or_insert_with(|| segment.text.clone());
                segment.text = fixed;
                segment.edited = true;
                changed += 1;
            }
            segment
        })
        .collect();
    (Transcript { segments }, changed)
}

/// Applies the current dictionary to a transcript just produced.
pub fn apply_current(transcript: Transcript) -> Transcript {
    let dictionary = current();
    if dictionary.is_empty() {
        return transcript;
    }
    apply_to_transcript(transcript, &dictionary).0
}

/// The terms to hand to the summaries, as one sentence; `None` when there
/// are none.
pub fn vocabulary_hint() -> Option<String> {
    let dictionary = current();
    (!dictionary.terms().is_empty()).then(|| {
        format!(
            "Spell these words exactly as written: {}.",
            dictionary.terms().join(", ")
        )
    })
}

/// The dictionary text as typed in Settings.
#[tauri::command]
pub fn get_dictionary() -> Result<String, AppError> {
    let root = paths::data_root().map_err(|err| AppError::Path(err.to_string()))?;
    Ok(load_text(&root))
}

/// Stores the dictionary text typed in Settings.
#[tauri::command]
pub fn set_dictionary(text: String) -> Result<(), AppError> {
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(AppError::Store("the vocabulary is too long".to_string()));
    }
    let root = paths::data_root().map_err(|err| AppError::Path(err.to_string()))?;
    save_text(&root, &text)
}

/// Applies the dictionary to every meeting already transcribed, except the
/// one being recorded. Resolves with the number of segments corrected.
/// Summaries written from the old text are marked stale.
#[tauri::command]
pub async fn apply_dictionary_to_meetings(app: AppHandle) -> Result<usize, AppError> {
    let app_for_worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_for_worker.state::<AppState>();
        let active = lock_session(&state)?.as_ref().map(|s| s.meeting_id);
        apply_to_store(state.store.as_ref(), &current(), active)
    })
    .await
    .unwrap_or_else(|_| {
        Err(AppError::Store(
            "apply_dictionary_to_meetings worker thread panicked".to_string(),
        ))
    })
}

/// Core of [`apply_dictionary_to_meetings`].
pub fn apply_to_store(
    store: &dyn MeetingStore,
    dictionary: &Dictionary,
    active: Option<crate::domain::MeetingId>,
) -> Result<usize, AppError> {
    if dictionary.is_empty() {
        return Ok(0);
    }
    let mut total = 0;
    for meeting in store.list()? {
        if active == Some(meeting.id) {
            continue;
        }
        let Some(transcript) = meeting.transcript.clone() else {
            continue;
        };
        let (fixed, changed) = apply_to_transcript(transcript, dictionary);
        if changed == 0 {
            continue;
        }
        store.save(&meeting.with_transcript(fixed).with_all_summaries_stale())?;
        crate::commands::notes::export_if_ready(store, meeting.id);
        total += changed;
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::fs_store::FsMeetingStore;
    use myna_stt::{Speaker, TranscriptSegment};

    fn segment(text: &str) -> TranscriptSegment {
        TranscriptSegment {
            start_sec: 0.0,
            end_sec: 1.0,
            text: text.to_string(),
            speaker: Speaker::others(),
            speaker_pinned: false,
            suspect_reasons: Vec::new(),
            original_text: None,
            edited: false,
        }
    }

    #[test]
    fn text_round_trips_and_keeps_the_other_preferences() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(
            dir.path().join(PREFERENCES_FILE),
            br#"{"summary":{"guidelines":"Be brief."}}"#,
        )
        .expect("seed");

        save_text(dir.path(), "fumur = fumure").expect("save");

        assert_eq!(load_text(dir.path()), "fumur = fumure");
        let raw = fs::read_to_string(dir.path().join(PREFERENCES_FILE)).expect("read");
        assert!(raw.contains("Be brief."));
        assert_eq!(load_text(tempfile::tempdir().expect("empty").path()), "");
    }

    #[test]
    fn a_corrected_segment_keeps_what_was_heard_and_counts_as_edited() {
        let dictionary = Dictionary::parse("fumur = fumure");
        let transcript = Transcript {
            segments: vec![segment("le fumur"), segment("rien")],
        };

        let (fixed, changed) = apply_to_transcript(transcript, &dictionary);

        assert_eq!(changed, 1);
        assert_eq!(fixed.segments[0].text, "le fumure");
        assert_eq!(fixed.segments[0].original_text.as_deref(), Some("le fumur"));
        assert!(fixed.segments[0].edited);
        assert!(!fixed.segments[1].edited);
    }

    #[test]
    fn applying_twice_does_not_lose_the_first_heard_text() {
        let dictionary = Dictionary::parse("a = b\nb = c");
        let (once, _) = apply_to_transcript(
            Transcript {
                segments: vec![segment("a")],
            },
            &dictionary,
        );
        let (twice, _) = apply_to_transcript(once, &dictionary);

        assert_eq!(twice.segments[0].original_text.as_deref(), Some("a"));
        assert_eq!(twice.segments[0].text, "c");
    }

    #[test]
    fn existing_meetings_are_corrected_and_their_summaries_marked_stale() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");
        store
            .save(&meeting.with_transcript(Transcript {
                segments: vec![segment("le fumur")],
            }))
            .expect("save");
        let live = store.create("En cours").expect("live");
        store
            .save(&live.with_transcript(Transcript {
                segments: vec![segment("le fumur")],
            }))
            .expect("save live");

        let n = apply_to_store(&store, &Dictionary::parse("fumur = fumure"), Some(live.id))
            .expect("apply");

        assert_eq!(n, 1);
        let text = |id| {
            store.get(id).expect("get").transcript.expect("t").segments[0]
                .text
                .clone()
        };
        assert_eq!(text(meeting.id), "le fumure");
        assert_eq!(text(live.id), "le fumur");
        assert_eq!(
            apply_to_store(&store, &Dictionary::parse(""), None).expect("empty"),
            0
        );
    }
}
