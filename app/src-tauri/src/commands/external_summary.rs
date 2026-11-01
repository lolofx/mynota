//! Summaries the user pasted from outside the app (ADR 0022), kept with the
//! meeting under a label and exported with the generated ones.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use time::OffsetDateTime;

use crate::commands::notes::export_if_ready;
use crate::domain::{ExternalSummary, MeetingId};
use crate::error::AppError;
use crate::state::AppState;
use crate::store::MeetingStore;

/// Serializes the read-modify-write of the pasted summaries.
static EXTERNAL_WRITE: Mutex<()> = Mutex::new(());

/// Longest label kept, in characters.
const MAX_LABEL_CHARS: usize = 60;

/// Longest pasted text accepted, in bytes.
const MAX_MARKDOWN_BYTES: usize = 1_000_000;

/// A pasted summary as the UI sees it.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSummaryDto {
    pub id: u32,
    pub label: String,
    pub markdown: String,
    pub created_at: String,
}

impl From<ExternalSummary> for ExternalSummaryDto {
    fn from(summary: ExternalSummary) -> Self {
        Self {
            id: summary.id,
            label: summary.label,
            markdown: summary.markdown,
            created_at: summary
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        }
    }
}

/// Lists the summaries pasted for `meeting_id`, oldest first.
#[tauri::command]
pub async fn list_external_summaries(
    app: AppHandle,
    meeting_id: String,
) -> Result<Vec<ExternalSummaryDto>, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("list_external_summaries", move || {
        Ok(store
            .read_external_summaries(id)?
            .into_iter()
            .map(Into::into)
            .collect())
    })
    .await
}

/// Keeps `markdown` with the meeting under `label`; returns the whole list.
#[tauri::command]
pub async fn add_external_summary(
    app: AppHandle,
    meeting_id: String,
    label: String,
    markdown: String,
) -> Result<Vec<ExternalSummaryDto>, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("add_external_summary", move || {
        Ok(add_summary(store.as_ref(), id, &label, &markdown)?
            .into_iter()
            .map(Into::into)
            .collect())
    })
    .await
}

/// Removes one pasted summary; returns what is left.
#[tauri::command]
pub async fn delete_external_summary(
    app: AppHandle,
    meeting_id: String,
    summary_id: u32,
) -> Result<Vec<ExternalSummaryDto>, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let store = app.state::<AppState>().store.clone();
    run_blocking("delete_external_summary", move || {
        Ok(delete_summary(store.as_ref(), id, summary_id)?
            .into_iter()
            .map(Into::into)
            .collect())
    })
    .await
}

/// Adds a pasted summary. A blank label falls back to `External`; a blank
/// text is refused.
pub fn add_summary(
    store: &dyn MeetingStore,
    id: MeetingId,
    label: &str,
    markdown: &str,
) -> Result<Vec<ExternalSummary>, AppError> {
    if markdown.trim().is_empty() {
        return Err(AppError::Store("the pasted summary is empty".to_string()));
    }
    if markdown.len() > MAX_MARKDOWN_BYTES {
        return Err(AppError::Store(
            "the pasted summary is too long".to_string(),
        ));
    }
    let label = label.split_whitespace().collect::<Vec<_>>().join(" ");
    let label: String = label.chars().take(MAX_LABEL_CHARS).collect();
    let label = if label.is_empty() {
        "External".to_string()
    } else {
        label
    };

    let _guard = EXTERNAL_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    let mut all = store.read_external_summaries(id)?;
    let next = all.iter().map(|s| s.id).max().unwrap_or(0) + 1;
    all.push(ExternalSummary {
        id: next,
        label,
        markdown: markdown.trim_end().to_string(),
        created_at: OffsetDateTime::now_utc(),
    });
    store.write_external_summaries(id, &all)?;
    export_if_ready(store, id);
    Ok(all)
}

/// Removes pasted summary `summary_id`; an unknown id changes nothing.
pub fn delete_summary(
    store: &dyn MeetingStore,
    id: MeetingId,
    summary_id: u32,
) -> Result<Vec<ExternalSummary>, AppError> {
    let _guard = EXTERNAL_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    let mut all = store.read_external_summaries(id)?;
    let before = all.len();
    all.retain(|s| s.id != summary_id);
    if all.len() != before {
        store.write_external_summaries(id, &all)?;
        export_if_ready(store, id);
    }
    Ok(all)
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

    fn store_with_meeting() -> (tempfile::TempDir, FsMeetingStore, MeetingId) {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        let id = store.create("Point").expect("create").id;
        (dir, store, id)
    }

    #[test]
    fn a_pasted_summary_is_kept_with_its_label_and_survives_a_reload() {
        let (_dir, store, id) = store_with_meeting();

        add_summary(&store, id, "  Claude   Haiku ", "# Résumé\n\nok\n\n").expect("add");

        let all = store.read_external_summaries(id).expect("read");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].label, "Claude Haiku");
        assert_eq!(all[0].markdown, "# Résumé\n\nok");
    }

    #[test]
    fn ids_are_never_reused_after_a_delete() {
        let (_dir, store, id) = store_with_meeting();
        add_summary(&store, id, "A", "one").expect("a");
        add_summary(&store, id, "B", "two").expect("b");

        let left = delete_summary(&store, id, 2).expect("delete");
        let again = add_summary(&store, id, "C", "three").expect("c");

        assert_eq!(left.iter().map(|s| s.id).collect::<Vec<_>>(), [1]);
        assert_eq!(again.iter().map(|s| s.id).collect::<Vec<_>>(), [1, 2]);
    }

    #[test]
    fn a_blank_label_gets_a_default_and_a_blank_text_is_refused() {
        let (_dir, store, id) = store_with_meeting();

        let all = add_summary(&store, id, "   ", "text").expect("add");
        assert_eq!(all[0].label, "External");
        assert!(add_summary(&store, id, "X", " \n ").is_err());
        assert_eq!(store.read_external_summaries(id).expect("read").len(), 1);
    }

    #[test]
    fn deleting_an_unknown_id_changes_nothing() {
        let (_dir, store, id) = store_with_meeting();
        add_summary(&store, id, "A", "one").expect("a");

        assert_eq!(delete_summary(&store, id, 99).expect("delete").len(), 1);
    }

    #[test]
    fn pasted_summaries_are_not_generated_ones() {
        let (_dir, store, id) = store_with_meeting();
        add_summary(&store, id, "A", "one").expect("a");

        let meeting = store.get(id).expect("get");

        assert!(meeting.summaries.is_empty());
    }

    #[test]
    fn an_unknown_meeting_is_not_found() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = FsMeetingStore::new(dir.path());
        assert!(matches!(
            add_summary(&store, MeetingId::new(), "A", "one"),
            Err(AppError::NotFound(_))
        ));
    }
}
