use crate::error::MeshError;
use crate::transport::ble::BleDeviceInfo;

#[tauri::command]
pub async fn list_serial_ports() -> Result<Vec<String>, MeshError> {
    meshtastic::utils::stream::available_serial_ports()
        .map_err(|e| MeshError::SerialPort(e.to_string()))
}

#[tauri::command]
pub async fn scan_ble_devices() -> Result<Vec<BleDeviceInfo>, MeshError> {
    crate::transport::ble::scan_ble()
        .await
        .map_err(MeshError::Ble)
}
