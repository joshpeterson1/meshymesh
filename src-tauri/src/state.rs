use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

use crate::error::MeshError;

#[derive(Debug)]
pub enum ConnectionCommand {
    SendText {
        local_id: String,
        text: String,
        destination: u32,
        channel: u32,
        want_ack: bool,
    },
    /// Send raw admin message bytes (pre-encoded AdminMessage protobuf)
    SendAdmin {
        admin_bytes: Vec<u8>,
        /// Pre-generated packet ID for ACK tracking
        packet_id: u32,
    },
    Disconnect,
}

pub struct ConnectionHandle {
    pub id: String,
    pub label: String,
    pub transport: String,
    pub transport_address: String,
    pub command_tx: mpsc::Sender<ConnectionCommand>,
    pub task_handle: tauri::async_runtime::JoinHandle<()>,
}

pub struct ConnectionManager {
    connections: HashMap<String, ConnectionHandle>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    pub fn insert(&mut self, handle: ConnectionHandle) -> Result<(), MeshError> {
        if self.connections.contains_key(&handle.id) {
            return Err(MeshError::ConnectionAlreadyExists(handle.id.clone()));
        }
        self.connections.insert(handle.id.clone(), handle);
        Ok(())
    }

    pub fn get_command_sender(
        &self,
        id: &str,
    ) -> Result<mpsc::Sender<ConnectionCommand>, MeshError> {
        self.connections
            .get(id)
            .map(|h| h.command_tx.clone())
            .ok_or_else(|| MeshError::ConnectionNotFound(id.to_string()))
    }

    pub fn remove(&mut self, id: &str) -> Option<ConnectionHandle> {
        self.connections.remove(id)
    }
}

pub struct AppState {
    pub manager: Arc<RwLock<ConnectionManager>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(RwLock::new(ConnectionManager::new())),
        }
    }
}
