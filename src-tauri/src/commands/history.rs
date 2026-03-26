use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::error::MeshError;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConnectionHistoryEntry {
    pub transport: String,
    pub address: String,
    pub label: String,
    pub short_name: Option<String>,
    pub last_connected: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct HistoryFile {
    connections: Vec<ConnectionHistoryEntry>,
}

const HISTORY_FILENAME: &str = "connection_history.json";
const MAX_HISTORY: usize = 20;

fn history_path(app: &AppHandle) -> Result<PathBuf, MeshError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| MeshError::Transport(format!("Failed to get app data dir: {}", e)))?;
    Ok(dir.join(HISTORY_FILENAME))
}

fn load_history(app: &AppHandle) -> HistoryFile {
    let path = match history_path(app) {
        Ok(p) => p,
        Err(_) => return HistoryFile::default(),
    };
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => HistoryFile::default(),
    }
}

fn save_history(app: &AppHandle, history: &HistoryFile) -> Result<(), MeshError> {
    let path = history_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| MeshError::Transport(format!("Failed to create app data dir: {}", e)))?;
    }
    let data = serde_json::to_string_pretty(history)
        .map_err(|e| MeshError::Transport(format!("Failed to serialize history: {}", e)))?;
    std::fs::write(&path, data)
        .map_err(|e| MeshError::Transport(format!("Failed to write history: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub async fn get_connection_history(
    app: AppHandle,
) -> Result<Vec<ConnectionHistoryEntry>, MeshError> {
    Ok(load_history(&app).connections)
}

#[tauri::command]
pub async fn save_connection_history_entry(
    app: AppHandle,
    transport: String,
    address: String,
    label: String,
    short_name: Option<String>,
) -> Result<(), MeshError> {
    let mut history = load_history(&app);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Update existing entry or add new one
    if let Some(existing) = history.connections.iter_mut().find(|e| {
        e.transport == transport && e.address == address
    }) {
        existing.label = label;
        existing.last_connected = now;
        if short_name.is_some() {
            existing.short_name = short_name;
        }
    } else {
        history.connections.push(ConnectionHistoryEntry {
            transport,
            address,
            label,
            short_name,
            last_connected: now,
        });
    }

    // Sort by most recent first, cap at MAX_HISTORY
    history.connections.sort_by(|a, b| b.last_connected.cmp(&a.last_connected));
    history.connections.truncate(MAX_HISTORY);

    save_history(&app, &history)
}

#[tauri::command]
pub async fn forget_connection_history_entry(
    app: AppHandle,
    transport: String,
    address: String,
) -> Result<(), MeshError> {
    let mut history = load_history(&app);
    history.connections.retain(|e| !(e.transport == transport && e.address == address));
    save_history(&app, &history)
}
