use tauri::State;

use crate::error::MeshError;
use crate::state::{AppState, ConnectionCommand};

#[tauri::command]
pub async fn send_text_message(
    state: State<'_, AppState>,
    connection_id: String,
    local_id: String,
    text: String,
    destination: u32,
    channel: u32,
    want_ack: bool,
    reply_id: Option<u32>,
    emoji: Option<u32>,
) -> Result<(), MeshError> {
    let mgr = state.manager.read().await;
    let tx = mgr.get_command_sender(&connection_id)?;
    tx.send(ConnectionCommand::SendText {
        local_id,
        text,
        destination,
        channel,
        want_ack,
        reply_id: reply_id.unwrap_or(0),
        emoji: emoji.unwrap_or(0),
    })
    .await
    .map_err(|_| MeshError::ChannelClosed)?;
    Ok(())
}
