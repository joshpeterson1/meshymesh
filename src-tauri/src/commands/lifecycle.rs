use tauri::{AppHandle, State};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::MeshError;
use crate::state::{AppState, ConnectionCommand, ConnectionHandle};
use crate::transport::connection::{run_connection, TransportKind};

#[tauri::command]
pub async fn connect_serial(
    app: AppHandle,
    state: State<'_, AppState>,
    port: String,
    label: String,
    baud: Option<u32>,
) -> Result<String, MeshError> {
    let conn_id = Uuid::new_v4().to_string();
    let (cmd_tx, cmd_rx) = mpsc::channel::<ConnectionCommand>(32);
    let manager = state.manager.clone();

    let handle = tauri::async_runtime::spawn(run_connection(
        app,
        conn_id.clone(),
        TransportKind::Serial {
            port: port.clone(),
            baud,
        },
        cmd_rx,
        manager.clone(),
    ));

    let conn_handle = ConnectionHandle {
        id: conn_id.clone(),
        label,
        transport: "serial".into(),
        transport_address: port,
        command_tx: cmd_tx,
        task_handle: handle,
    };

    let mut mgr = manager.write().await;
    mgr.insert(conn_handle)?;

    Ok(conn_id)
}

#[tauri::command]
pub async fn connect_tcp(
    app: AppHandle,
    state: State<'_, AppState>,
    address: String,
    label: String,
) -> Result<String, MeshError> {
    let conn_id = Uuid::new_v4().to_string();
    let (cmd_tx, cmd_rx) = mpsc::channel::<ConnectionCommand>(32);
    let manager = state.manager.clone();

    let full_address = if address.contains(':') {
        address.clone()
    } else {
        format!("{}:4403", address)
    };

    let handle = tauri::async_runtime::spawn(run_connection(
        app,
        conn_id.clone(),
        TransportKind::Tcp {
            address: full_address.clone(),
        },
        cmd_rx,
        manager.clone(),
    ));

    let conn_handle = ConnectionHandle {
        id: conn_id.clone(),
        label,
        transport: "wifi".into(),
        transport_address: full_address,
        command_tx: cmd_tx,
        task_handle: handle,
    };

    let mut mgr = manager.write().await;
    mgr.insert(conn_handle)?;

    Ok(conn_id)
}

#[tauri::command]
pub async fn disconnect_node(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), MeshError> {
    let mgr = state.manager.read().await;
    let tx = mgr.get_command_sender(&connection_id)?;
    tx.send(ConnectionCommand::Disconnect)
        .await
        .map_err(|_| MeshError::ChannelClosed)?;
    Ok(())
}
