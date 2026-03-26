use crate::error::MeshError;

#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<String>, MeshError> {
    meshtastic::utils::stream::available_serial_ports()
        .map_err(|e| MeshError::SerialPort(e.to_string()))
}
