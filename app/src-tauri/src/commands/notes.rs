//! The user's own notes on a meeting (ADR 0022): free Markdown typed or
//! dictated next to the transcript, stored in their own file and exported
//! as the last block of the Markdown file.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::auto_export;
use crate::commands::export::clock;
use crate::domain::MeetingId;
use crate::error::AppError;
use crate::state::AppState;
use crate::store::MeetingStore;

/// Serializes every notes write: appending a quick note is read-modify-write,
/// and a debounced save of the whole text could otherwise land in between and
/// drop a line.
static NOTES_WRITE: Mutex<()> = Mutex::new(());

/// Longest notes text accepted, in bytes. Far above any real note; a guard
/// against a runaway paste filling the disk.
const MAX_NOTES_BYTES: usize = 1_000_000;

/// Reads the notes of `meeting_id` (empty when none were taken).
#[tauri::command]
pub async fn get_meeting_notes(app: AppHandle, meeting_id: String) -> Result<String, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("get_meeting_notes", move || store.read_notes(id)).await
}

/// Replaces the notes of `meeting_id` with `text`.
#[tauri::command]
pub async fn set_meeting_notes(
    app: AppHandle,
    meeting_id: String,
    text: String,
) -> Result<(), AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("set_meeting_notes", move || {
        set_notes(store.as_ref(), id, &text)
    })
    .await
}

/// Adds one line to the notes, prefixed with `[hh:mm:ss]` when `at_sec` is
/// given (the elapsed time of the recording or of the playback), and returns
/// the full notes text.
#[tauri::command]
pub async fn append_meeting_note(
    app: AppHandle,
    meeting_id: String,
    text: String,
    at_sec: Option<f32>,
) -> Result<String, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("append_meeting_note", move || {
        append_note(store.as_ref(), id, &text, at_sec)
    })
    .await
}

/// Replaces the notes and refreshes the exported file.
pub fn set_notes(store: &dyn MeetingStore, id: MeetingId, text: &str) -> Result<(), AppError> {
    if text.len() > MAX_NOTES_BYTES {
        return Err(AppError::Store("the notes are too long".to_string()));
    }
    let _guard = NOTES_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    store.write_notes(id, text)?;
    export_if_ready(store, id);
    Ok(())
}

/// Appends one stamped line to the notes and returns the whole text. A blank
/// `text` changes nothing.
pub fn append_note(
    store: &dyn MeetingStore,
    id: MeetingId,
    text: &str,
    at_sec: Option<f32>,
) -> Result<String, AppError> {
    let _guard = NOTES_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    let mut notes = store.read_notes(id)?;
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.is_empty() {
        return Ok(notes);
    }
    if !notes.is_empty() && !notes.ends_with('\n') {
        notes.push('\n');
    }
    if let Some(at) = at_sec {
        notes.push_str(&format!("[{}] ", clock(at)));
    }
    notes.push_str(&line);
    notes.push('\n');
    if notes.len() > MAX_NOTES_BYTES {
        return Err(AppError::Store("the notes are too long".to_string()));
    }
    store.write_notes(id, &notes)?;
    export_if_ready(store, id);
    Ok(notes)
}

/// Re-exports once the meeting has a transcript or a linked file, so a note
/// taken mid-recording does not create a half-empty file.
pub(crate) fn export_if_ready(store: &dyn MeetingStore, id: MeetingId) {
    if let Ok(meeting) = store.get(id) {
        if meeting.transcript.is_some() || meeting.export_path.is_some() {
            auto_export::after_save(store, id);
        }
    }
}

async fn run_blocking<T: Send + 'static>(
    name: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or_else(|_| Err(AppError::Store(format!("{name} worker thread panicked"))))
}

fn parse_meeting_id(id: &str) -> Result<MeetingId, AppError> {
    id.parse().map_err(|_| AppError::NotFound(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::fs_store::FsMeetingStore;

    #[test]
    fn notes_start_empty_and_round_trip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");
        assert_eq!(store.read_notes(meeting.id).expect("read"), "");

        set_notes(&store, meeting.id, "à vérifier\n").expect("set");

        assert_eq!(store.read_notes(meeting.id).expect("read"), "à vérifier\n");
    }

    #[test]
    fn notes_of_an_unknown_meeting_are_not_found() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        assert!(matches!(
            store.read_notes(MeetingId::new()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            set_notes(&store, MeetingId::new(), "x"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_quick_note_is_stamped_with_the_elapsed_time_and_appended() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");

        append_note(&store, meeting.id, "check   this point", Some(760.4)).expect("first");
        let all = append_note(&store, meeting.id, "no stamp", None).expect("second");

        assert_eq!(all, "[00:12:40] check this point\nno stamp\n");
    }

    #[test]
    fn a_blank_quick_note_changes_nothing_and_a_missing_final_newline_is_added() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");
        store
            .write_notes(meeting.id, "typed by hand")
            .expect("seed");

        assert_eq!(
            append_note(&store, meeting.id, "  \n ", Some(1.0)).expect("blank"),
            "typed by hand"
        );
        let all = append_note(&store, meeting.id, "next", Some(61.0)).expect("append");

        assert_eq!(all, "typed by hand\n[00:01:01] next\n");
    }

    #[test]
    fn notes_survive_a_new_transcript_and_a_summary() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");
        set_notes(&store, meeting.id, "mine").expect("set");

        store
            .save(&meeting.with_transcript(myna_stt::Transcript {
                segments: Vec::new(),
            }))
            .expect("save");
        store
            .save_summary(meeting.id, "key-points", "en", "# Summary")
            .expect("summary");

        assert_eq!(store.read_notes(meeting.id).expect("read"), "mine");
    }

    #[test]
    fn an_oversized_text_is_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let meeting = store.create("Point").expect("create");
        let huge = "x".repeat(MAX_NOTES_BYTES + 1);

        assert!(set_notes(&store, meeting.id, &huge).is_err());
        assert_eq!(store.read_notes(meeting.id).expect("read"), "");
    }
}
