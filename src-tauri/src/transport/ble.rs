use std::time::Duration;

use btleplug::api::{
    Central, CharPropFlags, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType,
};
use btleplug::platform::{Adapter, Manager, Peripheral};
use meshtastic::protobufs::{FromRadio, ToRadio};
use prost::Message as ProstMessage;
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_stream::StreamExt;
use uuid::Uuid;

#[derive(Serialize)]
pub struct BleDeviceInfo {
    pub name: String,
    pub address: String,
    pub rssi: Option<i16>,
}

/// Meshtastic BLE service UUID
const SERVICE_UUID: Uuid = Uuid::from_u128(0x6ba1b218_15a8_461f_9fa8_5dcae273eafd);
/// FromRadio characteristic — read discrete protobuf messages
const FROMRADIO_UUID: Uuid = Uuid::from_u128(0x2c55e69e_4993_11ed_b878_0242ac120002);
/// ToRadio characteristic — write encoded protobuf messages
const TORADIO_UUID: Uuid = Uuid::from_u128(0xf75c76d2_129e_4dad_a1dd_7866124401e7);
/// FromNum characteristic — subscribe for notifications that trigger read cycles
const FROMNUM_UUID: Uuid = Uuid::from_u128(0xed9da18c_a800_4f66_a670_aa7547e34453);

/// Get the first available BLE adapter.
async fn get_adapter() -> Result<Adapter, String> {
    let manager = Manager::new()
        .await
        .map_err(|e| format!("BLE manager init failed: {}", e))?;
    let adapters = manager
        .adapters()
        .await
        .map_err(|e| format!("Failed to get BLE adapters: {}", e))?;
    adapters
        .into_iter()
        .next()
        .ok_or_else(|| "No BLE adapter found".to_string())
}

/// Scan for Meshtastic BLE devices for 3 seconds, returning discovered devices.
pub async fn scan_ble() -> Result<Vec<BleDeviceInfo>, String> {
    let adapter = get_adapter().await?;

    adapter
        .start_scan(ScanFilter {
            services: vec![SERVICE_UUID],
        })
        .await
        .map_err(|e| format!("BLE scan start failed: {}", e))?;

    tokio::time::sleep(Duration::from_secs(3)).await;

    let peripherals = adapter
        .peripherals()
        .await
        .map_err(|e| format!("Failed to list peripherals: {}", e))?;

    let mut devices = Vec::new();
    for p in peripherals {
        let props = p.properties().await.ok().flatten();
        let name = props
            .as_ref()
            .and_then(|p| p.local_name.clone())
            .unwrap_or_default();
        let rssi = props.as_ref().and_then(|p| p.rssi);
        let address = p.id().to_string();

        let advertises_service = props
            .as_ref()
            .map(|p| p.services.contains(&SERVICE_UUID))
            .unwrap_or(false);
        if !advertises_service && name.is_empty() {
            continue;
        }

        devices.push(BleDeviceInfo {
            name,
            address,
            rssi,
        });
    }

    adapter.stop_scan().await.ok();

    log::info!("BLE scan complete: found {} Meshtastic devices", devices.len());
    Ok(devices)
}

/// Find a characteristic by UUID on a connected peripheral.
fn find_characteristic(
    characteristics: &[Characteristic],
    uuid: Uuid,
) -> Result<Characteristic, String> {
    characteristics
        .iter()
        .find(|c| c.uuid == uuid)
        .cloned()
        .ok_or_else(|| format!("Characteristic {} not found", uuid))
}

/// Connect to a Meshtastic BLE peripheral and return channels for protobuf communication.
pub async fn open_ble(
    address: &str,
) -> Result<(mpsc::Receiver<FromRadio>, mpsc::Sender<ToRadio>), String> {
    let adapter = get_adapter().await?;

    let peripherals = adapter
        .peripherals()
        .await
        .map_err(|e| format!("Failed to list peripherals: {}", e))?;

    let peripheral = peripherals
        .into_iter()
        .find(|p| p.id().to_string() == address)
        .ok_or_else(|| format!("BLE device not found: {}", address))?;

    peripheral
        .connect()
        .await
        .map_err(|e| format!("BLE connect failed: {}", e))?;

    log::info!("BLE connected to {}", address);

    peripheral
        .discover_services()
        .await
        .map_err(|e| format!("BLE service discovery failed: {}", e))?;

    let chars: Vec<Characteristic> = peripheral
        .services()
        .iter()
        .flat_map(|s| s.characteristics.clone())
        .collect();

    let fromradio_char = find_characteristic(&chars, FROMRADIO_UUID)?;
    let toradio_char = find_characteristic(&chars, TORADIO_UUID)?;
    let fromnum_char = find_characteristic(&chars, FROMNUM_UUID)?;

    if fromnum_char.properties.contains(CharPropFlags::NOTIFY) {
        peripheral
            .subscribe(&fromnum_char)
            .await
            .map_err(|e| format!("BLE subscribe to FromNum failed: {}", e))?;
        log::info!("BLE subscribed to FromNum notifications");
    } else {
        log::warn!("BLE FromNum characteristic does not support NOTIFY");
    }

    let (from_tx, from_rx) = mpsc::channel::<FromRadio>(256);
    let (to_tx, to_rx) = mpsc::channel::<ToRadio>(32);

    tokio::spawn(ble_reader(peripheral.clone(), fromradio_char, from_tx));
    tokio::spawn(ble_writer(peripheral, toradio_char, to_rx));

    Ok((from_rx, to_tx))
}

/// BLE reader task: listens for FromNum notifications, then drains FromRadio reads.
///
/// On each notification from the peripheral's notification stream, reads the
/// FromRadio characteristic in a loop until it returns empty bytes. Each non-empty
/// read is decoded as a `FromRadio` protobuf message.
async fn ble_reader(
    peripheral: Peripheral,
    fromradio_char: Characteristic,
    tx: mpsc::Sender<FromRadio>,
) {
    let mut notification_stream = match peripheral.notifications().await {
        Ok(stream) => stream,
        Err(e) => {
            log::error!("BLE reader: failed to get notification stream: {}", e);
            return;
        }
    };

    log::info!("BLE reader: active and listening for FromNum notifications");

    drain_fromradio(&peripheral, &fromradio_char, &tx).await;

    loop {
        if tx.is_closed() {
            log::info!("BLE reader: receiver dropped, stopping");
            break;
        }

        match tokio::time::timeout(Duration::from_secs(5), notification_stream.next()).await {
            Ok(Some(notification)) => {
                if notification.uuid == FROMNUM_UUID {
                    log::debug!("BLE reader: FromNum notification received, draining FromRadio");
                    drain_fromradio(&peripheral, &fromradio_char, &tx).await;
                }
            }
            Ok(None) => {
                log::warn!("BLE reader: notification stream ended");
                break;
            }
            Err(_) => {
                // Timeout — just loop and check if closed
                continue;
            }
        }
    }

    log::info!("BLE reader: stopped");
}

/// Read FromRadio characteristic in a loop until empty bytes are returned.
async fn drain_fromradio(
    peripheral: &Peripheral,
    fromradio_char: &Characteristic,
    tx: &mpsc::Sender<FromRadio>,
) {
    loop {
        match peripheral.read(fromradio_char).await {
            Ok(data) => {
                if data.is_empty() {
                    break;
                }
                match FromRadio::decode(data.as_slice()) {
                    Ok(packet) => {
                        if tx.send(packet).await.is_err() {
                            log::warn!("BLE reader: receiver dropped during drain");
                            return;
                        }
                    }
                    Err(e) => {
                        log::warn!("BLE reader: protobuf decode error: {}", e);
                    }
                }
            }
            Err(e) => {
                log::error!("BLE reader: read error: {}", e);
                break;
            }
        }
        // Small delay between reads to avoid overwhelming the BLE peripheral
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

/// BLE writer task: encodes ToRadio protobufs and writes them to the characteristic.
async fn ble_writer(
    peripheral: Peripheral,
    toradio_char: Characteristic,
    mut rx: mpsc::Receiver<ToRadio>,
) {
    while let Some(packet) = rx.recv().await {
        let payload = packet.encode_to_vec();
        log::info!(
            "BLE writer: writing {} byte protobuf payload",
            payload.len()
        );

        if let Err(e) = peripheral
            .write(&toradio_char, &payload, WriteType::WithResponse)
            .await
        {
            log::error!("BLE write error: {}", e);
            break;
        }

        log::debug!("BLE writer: write complete");
    }
    log::info!("BLE writer: channel closed, stopping");
}
