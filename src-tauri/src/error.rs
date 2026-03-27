use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MeshError {
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Connection already exists: {0}")]
    ConnectionAlreadyExists(String),

    #[error("Transport error: {0}")]
    Transport(String),

    #[error("Configuration failed: {0}")]
    ConfigurationFailed(String),

    #[error("Send failed: {0}")]
    SendFailed(String),

    #[error("Channel closed")]
    ChannelClosed,

    #[error("Serial port error: {0}")]
    SerialPort(String),

    #[error("BLE error: {0}")]
    Ble(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

impl Serialize for MeshError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
