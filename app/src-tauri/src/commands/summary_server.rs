//! Settings commands for the optional summary server on the user's own
//! network (ADR 0021). The address and model live in `preferences.json`
//! under the data root, never in the repository.

use serde::{Deserialize, Serialize};

use myna_llm::{list_remote_models, Endpoint};

use crate::error::AppError;
use crate::paths;
use crate::summary_prefs::{self, SummaryServerPrefs};

/// The summary server as the settings screen sees it.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryServerDto {
    pub url: String,
    pub model: String,
    pub enabled: bool,
}

impl From<SummaryServerPrefs> for SummaryServerDto {
    fn from(prefs: SummaryServerPrefs) -> Self {
        Self {
            url: prefs.url,
            model: prefs.model,
            enabled: prefs.enabled,
        }
    }
}

/// Validates and normalises what the user typed, so a bad address is
/// refused when it is saved rather than at the end of a long meeting.
/// Only the *shape* is checked here (no network access).
pub fn validate_server(server: &SummaryServerDto) -> Result<SummaryServerPrefs, AppError> {
    let url = server.url.trim().to_string();
    let model = server.model.trim().to_string();
    if server.enabled {
        Endpoint::parse(&url)?;
        if model.is_empty() {
            return Err(myna_llm::LlmError::Remote(
                "choose a model on the summary server".to_string(),
            )
            .into());
        }
    }
    Ok(SummaryServerPrefs {
        url,
        model,
        enabled: server.enabled,
    })
}

/// Returns the saved summary server, or an empty, switched-off one.
#[tauri::command]
pub fn get_summary_server() -> Result<SummaryServerDto, AppError> {
    let root = paths::data_root().map_err(|err| AppError::Path(err.to_string()))?;
    Ok(summary_prefs::load(&root)
        .server
        .map(SummaryServerDto::from)
        .unwrap_or_default())
}

/// Saves the summary server. Refuses an enabled server whose address is not
/// a plain `http://` address or has no model.
#[tauri::command]
pub fn set_summary_server(server: SummaryServerDto) -> Result<(), AppError> {
    let validated = validate_server(&server)?;
    let root = paths::data_root().map_err(|err| AppError::Path(err.to_string()))?;
    let mut prefs = summary_prefs::load(&root);
    prefs.server = Some(validated);
    summary_prefs::save(&root, &prefs)
}

/// Contacts the server and lists its models: both the "test connection"
/// button and the source of the model picker. The address is checked to be
/// on a private network before any connection is made.
#[tauri::command]
pub async fn list_summary_server_models(url: String) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || list_remote_models(&url).map_err(AppError::from))
        .await
        .unwrap_or_else(|_| {
            Err(AppError::Store(
                "list_summary_server_models worker thread panicked".to_string(),
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dto(url: &str, model: &str, enabled: bool) -> SummaryServerDto {
        SummaryServerDto {
            url: url.into(),
            model: model.into(),
            enabled,
        }
    }

    #[test]
    fn an_enabled_server_needs_a_model() {
        let result = validate_server(&dto("http://host.invalid:11434", "  ", true));
        assert!(result.is_err());
    }

    #[test]
    fn https_is_refused_when_enabled() {
        let result = validate_server(&dto("https://host.invalid", "m", true));
        assert!(result.is_err());
    }

    #[test]
    fn a_disabled_server_keeps_whatever_was_typed() {
        let saved = validate_server(&dto("  half typed ", "", false)).expect("kept as typed");
        assert_eq!(saved.url, "half typed");
        assert!(!saved.enabled);
    }

    #[test]
    fn address_and_model_are_trimmed() {
        let saved =
            validate_server(&dto(" http://host.invalid:11434 ", " m:1b ", true)).expect("valid");
        assert_eq!(saved.url, "http://host.invalid:11434");
        assert_eq!(saved.model, "m:1b");
    }
}
