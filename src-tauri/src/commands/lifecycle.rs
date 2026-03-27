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
pub async fn connect_ble(
    app: AppHandle,
    state: State<'_, AppState>,
    address: String,
    label: String,
) -> Result<String, MeshError> {
    let conn_id = Uuid::new_v4().to_string();
    let (cmd_tx, cmd_rx) = mpsc::channel::<ConnectionCommand>(32);
    let manager = state.manager.clone();

    let handle = tauri::async_runtime::spawn(run_connection(
        app,
        conn_id.clone(),
        TransportKind::Ble {
            address: address.clone(),
        },
        cmd_rx,
        manager.clone(),
    ));

    let conn_handle = ConnectionHandle {
        id: conn_id.clone(),
        label,
        transport: "ble".into(),
        transport_address: address,
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
    // Remove the handle from the manager immediately so the connection ID
    // and transport resources (e.g. serial port) are freed for reconnect.
    let handle = {
        let mut mgr = state.manager.write().await;
        mgr.remove(&connection_id)
            .ok_or_else(|| MeshError::ConnectionNotFound(connection_id.clone()))?
    };

    // Signal the task to stop
    let _ = handle.command_tx.send(ConnectionCommand::Disconnect).await;

    // Wait for the task to finish (with timeout to avoid hanging forever)
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        handle.task_handle,
    )
    .await;

    Ok(())
}
