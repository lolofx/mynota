//! Freeing a meeting's audio (ADR 0022). The rules live in
//! [`crate::audio_purge`]; these commands only add the recording guard.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use time::OffsetDateTime;

use crate::audio_purge;
use crate::commands::recording::lock_session;
use crate::domain::MeetingId;
use crate::error::AppError;
use crate::state::AppState;

/// The audio of one meeting, as the UI sees it.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioUsageDto {
    pub bytes: u64,
    pub purged: bool,
    pub can_purge: bool,
}

/// What a bulk purge would remove.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PurgePreviewDto {
    pub count: usize,
    pub bytes: u64,
}

/// What a purge freed.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResultDto {
    pub count: usize,
    pub freed_bytes: u64,
}

/// Size, purge state and whether a purge is allowed for `meeting_id`.
#[tauri::command]
pub async fn get_audio_usage(
    app: AppHandle,
    meeting_id: String,
) -> Result<AudioUsageDto, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    run_blocking(&app, "get_audio_usage", move |state| {
        let usage = audio_purge::usage(state.store.as_ref(), id, active_meeting(&state)?)?;
        Ok(AudioUsageDto {
            bytes: usage.bytes,
            purged: usage.purged,
            can_purge: usage.can_purge,
        })
    })
    .await
}

/// Removes the audio of `meeting_id`; resolves with the bytes freed.
#[tauri::command]
pub async fn purge_meeting_audio(
    app: AppHandle,
    meeting_id: String,
) -> Result<PurgeResultDto, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    run_blocking(&app, "purge_meeting_audio", move |state| {
        let freed = audio_purge::purge(state.store.as_ref(), id, active_meeting(&state)?)?;
        Ok(PurgeResultDto {
            count: 1,
            freed_bytes: freed,
        })
    })
    .await
}

/// How many meetings, and how much disk, a purge of the audio older than
/// `older_than_days` days would free.
#[tauri::command]
pub async fn preview_audio_purge(
    app: AppHandle,
    older_than_days: u32,
) -> Result<PurgePreviewDto, AppError> {
    run_blocking(&app, "preview_audio_purge", move |state| {
        let found = audio_purge::candidates(
            state.store.as_ref(),
            older_than_days,
            OffsetDateTime::now_utc(),
            active_meeting(&state)?,
        )?;
        Ok(PurgePreviewDto {
            count: found.len(),
            bytes: found.iter().map(|c| c.bytes).sum(),
        })
    })
    .await
}

/// Purges the audio of every transcribed meeting older than `older_than_days`.
#[tauri::command]
pub async fn purge_old_audio(
    app: AppHandle,
    older_than_days: u32,
) -> Result<PurgeResultDto, AppError> {
    run_blocking(&app, "purge_old_audio", move |state| {
        let (count, freed) = audio_purge::purge_older_than(
            state.store.as_ref(),
            older_than_days,
            OffsetDateTime::now_utc(),
            active_meeting(&state)?,
        )?;
        Ok(PurgeResultDto {
            count,
            freed_bytes: freed,
        })
    })
    .await
}

fn active_meeting(state: &AppState) -> Result<Option<MeetingId>, AppError> {
    Ok(lock_session(state)?.as_ref().map(|s| s.meeting_id))
}

async fn run_blocking<T: Send + 'static>(
    app: &AppHandle,
    name: &'static str,
    work: impl FnOnce(tauri::State<'_, AppState>) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || work(app.state::<AppState>()))
        .await
        .unwrap_or_else(|_| Err(AppError::Store(format!("{name} worker thread panicked"))))
}

fn parse_meeting_id(id: &str) -> Result<MeetingId, AppError> {
    id.parse().map_err(|_| AppError::NotFound(id.to_string()))
}
