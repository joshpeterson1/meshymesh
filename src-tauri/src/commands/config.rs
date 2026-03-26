use prost::Message as ProstMessage;
use tauri::State;

use crate::error::MeshError;
use crate::state::{AppState, ConnectionCommand};
use meshtastic::protobufs;

/// Build an AdminMessage with BeginEditSettings, one or more SetConfig/SetChannel,
/// then CommitEditSettings. Returns a Vec of encoded AdminMessage byte arrays
/// to send sequentially.
fn build_config_transaction(
    configs: Vec<protobufs::admin_message::PayloadVariant>,
) -> Vec<Vec<u8>> {
    let mut messages = Vec::new();

    // Begin transaction
    let begin = protobufs::AdminMessage {
        session_passkey: vec![],
        payload_variant: Some(protobufs::admin_message::PayloadVariant::BeginEditSettings(true)),
    };
    messages.push(begin.encode_to_vec());

    // Set each config
    for variant in configs {
        let admin = protobufs::AdminMessage {
            session_passkey: vec![],
            payload_variant: Some(variant),
        };
        messages.push(admin.encode_to_vec());
    }

    // Commit transaction
    let commit = protobufs::AdminMessage {
        session_passkey: vec![],
        payload_variant: Some(protobufs::admin_message::PayloadVariant::CommitEditSettings(true)),
    };
    messages.push(commit.encode_to_vec());

    messages
}

/// Send a sequence of admin messages to a connection.
async fn send_admin_sequence(
    state: &State<'_, AppState>,
    connection_id: &str,
    messages: Vec<Vec<u8>>,
) -> Result<(), MeshError> {
    let mgr = state.manager.read().await;
    let tx = mgr.get_command_sender(connection_id)?;
    for admin_bytes in messages {
        tx.send(ConnectionCommand::SendAdmin { admin_bytes })
            .await
            .map_err(|_| MeshError::ChannelClosed)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_lora_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let lora: protobufs::config::LoRaConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid LoRa config: {}", e)))?;

    // Validate constraints
    if lora.hop_limit > 7 {
        return Err(MeshError::Validation("Hop limit must be 1-7".into()));
    }

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Lora(lora)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_device_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let device: protobufs::config::DeviceConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid device config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Device(device)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_display_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let display: protobufs::config::DisplayConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid display config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Display(display)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_power_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let power: protobufs::config::PowerConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid power config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Power(power)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_position_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let position: protobufs::config::PositionConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid position config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Position(position)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_bluetooth_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let bluetooth: protobufs::config::BluetoothConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid bluetooth config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Bluetooth(bluetooth)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_security_config(
    state: State<'_, AppState>,
    connection_id: String,
    config: serde_json::Value,
) -> Result<(), MeshError> {
    let security: protobufs::config::SecurityConfig = serde_json::from_value(config)
        .map_err(|e| MeshError::Validation(format!("Invalid security config: {}", e)))?;

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetConfig(protobufs::Config {
            payload_variant: Some(protobufs::config::PayloadVariant::Security(security)),
        }),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}

#[tauri::command]
pub async fn set_channel(
    state: State<'_, AppState>,
    connection_id: String,
    channel: serde_json::Value,
) -> Result<(), MeshError> {
    let ch: protobufs::Channel = serde_json::from_value(channel)
        .map_err(|e| MeshError::Validation(format!("Invalid channel config: {}", e)))?;

    // Validate channel name length
    if let Some(ref settings) = ch.settings {
        if settings.name.len() > 11 {
            return Err(MeshError::Validation("Channel name must be < 12 bytes".into()));
        }
        // Validate PSK length (0, 16, or 32 bytes)
        let psk_len = settings.psk.len();
        if psk_len != 0 && psk_len != 1 && psk_len != 16 && psk_len != 32 {
            return Err(MeshError::Validation(
                "Channel PSK must be 0, 1 (default), 16, or 32 bytes".into(),
            ));
        }
    }

    let messages = build_config_transaction(vec![
        protobufs::admin_message::PayloadVariant::SetChannel(ch),
    ]);

    send_admin_sequence(&state, &connection_id, messages).await
}
