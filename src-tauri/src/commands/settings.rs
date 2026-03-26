use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::error::MeshError;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Days before a node is considered stale and cleaned up (1-30, default 7)
    pub stale_node_days: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            stale_node_days: 7,
        }
    }
}

const SETTINGS_FILENAME: &str = "app_settings.json";

fn settings_path(app: &AppHandle) -> Result<PathBuf, MeshError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| MeshError::Transport(format!("Failed to get app data dir: {}", e)))?;
    Ok(dir.join(SETTINGS_FILENAME))
}

#[tauri::command]
pub async fn get_app_settings(app: AppHandle) -> Result<AppSettings, MeshError> {
    let path = settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(data) => Ok(serde_json::from_str(&data).unwrap_or_default()),
        Err(_) => Ok(AppSettings::default()),
    }
}

#[tauri::command]
pub async fn set_app_settings(
    app: AppHandle,
    settings: AppSettings,
) -> Result<(), MeshError> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| MeshError::Transport(format!("Failed to create dir: {}", e)))?;
    }

    // Validate
    if settings.stale_node_days < 1 || settings.stale_node_days > 30 {
        return Err(MeshError::Validation(
            "Stale node days must be between 1 and 30".into(),
        ));
    }

    let data = serde_json::to_string_pretty(&settings)
        .map_err(|e| MeshError::Transport(format!("Serialize failed: {}", e)))?;
    std::fs::write(&path, data)
        .map_err(|e| MeshError::Transport(format!("Write failed: {}", e)))?;
    Ok(())
}
