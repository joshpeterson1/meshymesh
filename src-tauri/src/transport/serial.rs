use std::time::Duration;

use meshtastic::protobufs::{FromRadio, ToRadio};
use prost::Message as ProstMessage;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio_serial::{SerialPort, SerialPortBuilderExt};

const HEADER: [u8; 2] = [0x94, 0xC3];
const MAX_PACKET_SIZE: usize = 512;

/// Open a serial connection and return channels for sending/receiving protobufs.
/// Drains stale data and ensures the reader is active BEFORE returning,
/// so WantConfigId can be sent immediately after without losing the response.
pub async fn open_serial(
    port_name: &str,
    baud_rate: u32,
) -> Result<
    (
        mpsc::Receiver<FromRadio>,
        mpsc::Sender<ToRadio>,
    ),
    String,
> {
    let mut port = tokio_serial::new(port_name, baud_rate)
        .flow_control(tokio_serial::FlowControl::None)
        .timeout(Duration::from_millis(100))
        .open_native_async()
        .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

    // Do NOT set DTR high — on ESP32 boards, DTR is wired to the EN (reset)
    // pin through the auto-reset circuit, and toggling it will reboot the device.
    // Leave DTR/RTS at their default state (low) to avoid unintended resets.
    port.write_data_terminal_ready(false)
        .map_err(|e| format!("DTR failed: {}", e))?;
    port.write_request_to_send(false)
        .map_err(|e| format!("RTS failed: {}", e))?;

    // Drain any stale data from previous sessions BEFORE starting the reader
    let mut drain_buf = [0u8; 1024];
    let mut drained = 0usize;
    loop {
        match tokio::time::timeout(Duration::from_millis(100), port.read(&mut drain_buf)).await {
            Ok(Ok(n)) if n > 0 => {
                drained += n;
                continue;
            }
            _ => break,
        }
    }

    log::info!(
        "Serial port {} opened: baud={}, drained {} stale bytes, reader starting now",
        port_name,
        baud_rate,
        drained,
    );

    let (reader, writer) = tokio::io::split(port);

    let (from_tx, from_rx) = mpsc::channel::<FromRadio>(256);
    let (to_tx, to_rx) = mpsc::channel::<ToRadio>(32);

    // Reader starts IMMEDIATELY — no sleep, no drain, ready to receive
    tokio::spawn(serial_reader(reader, from_tx));
    tokio::spawn(serial_writer(writer, to_rx));

    Ok((from_rx, to_tx))
}

/// Reads bytes from serial, finds 0x94 0xC3 frames, decodes FromRadio protobufs.
async fn serial_reader(
    mut reader: tokio::io::ReadHalf<tokio_serial::SerialStream>,
    tx: mpsc::Sender<FromRadio>,
) {
    let mut buf = Vec::with_capacity(4096);
    let mut read_buf = [0u8; 1024];

    log::info!("Serial reader: active and listening for frames");

    loop {
        // Check if the connection loop has dropped our receiver (disconnect)
        if tx.is_closed() {
            log::info!("Serial reader: receiver dropped, stopping");
            break;
        }

        match tokio::time::timeout(Duration::from_millis(500), reader.read(&mut read_buf)).await {
            Ok(Ok(0)) => {
                log::warn!("Serial reader: port closed");
                break;
            }
            Ok(Ok(n)) => {
                buf.extend_from_slice(&read_buf[..n]);
            }
            Ok(Err(e)) => {
                if e.kind() == std::io::ErrorKind::TimedOut {
                    continue;
                }
                log::error!("Serial read error: {}", e);
                break;
            }
            Err(_) => {
                continue;
            }
        }

        // Extract complete frames
        loop {
            match extract_frame(&mut buf) {
                Some(payload) => match FromRadio::decode(payload.as_slice()) {
                    Ok(packet) => {
                        if tx.send(packet).await.is_err() {
                            log::warn!("Serial reader: receiver dropped");
                            return;
                        }
                    }
                    Err(e) => {
                        log::warn!("Serial reader: protobuf decode error: {}", e);
                    }
                },
                None => break,
            }
        }

        if buf.len() > 8192 {
            log::warn!("Serial reader: buffer overflow ({} bytes), resetting", buf.len());
            buf.clear();
        }
    }
}

/// Extract one complete frame from the buffer.
/// Frame format: [0x94] [0xC3] [len_msb] [len_lsb] [protobuf_payload...]
fn extract_frame(buf: &mut Vec<u8>) -> Option<Vec<u8>> {
    loop {
        if buf.len() < 4 {
            return None;
        }

        if buf[0] == HEADER[0] && buf[1] == HEADER[1] {
            break;
        }

        buf.remove(0);
    }

    let len = ((buf[2] as usize) << 8) | (buf[3] as usize);

    if len == 0 || len > MAX_PACKET_SIZE {
        buf.drain(..2);
        return extract_frame(buf);
    }

    if buf.len() < 4 + len {
        return None;
    }

    let payload = buf[4..4 + len].to_vec();
    buf.drain(..4 + len);

    Some(payload)
}

/// Writes ToRadio protobufs to serial with proper framing.
async fn serial_writer(
    mut writer: tokio::io::WriteHalf<tokio_serial::SerialStream>,
    mut rx: mpsc::Receiver<ToRadio>,
) {
    while let Some(packet) = rx.recv().await {
        let payload = packet.encode_to_vec();
        let len = payload.len();

        if len > MAX_PACKET_SIZE {
            log::error!("Serial writer: packet too large ({} bytes)", len);
            continue;
        }

        let mut frame = Vec::with_capacity(4 + len);
        frame.push(HEADER[0]);
        frame.push(HEADER[1]);
        frame.push((len >> 8) as u8);
        frame.push((len & 0xFF) as u8);
        frame.extend_from_slice(&payload);

        log::info!("Serial writer: writing {} byte frame ({} byte payload): {:02x?}", frame.len(), len, &frame);

        if let Err(e) = writer.write_all(&frame).await {
            log::error!("Serial write error: {}", e);
            break;
        }
        if let Err(e) = writer.flush().await {
            log::error!("Serial flush error: {}", e);
            break;
        }

        log::info!("Serial writer: frame written and flushed successfully");
    }
    log::info!("Serial writer: channel closed, stopping");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_frame(payload: &[u8]) -> Vec<u8> {
        let len = payload.len();
        let mut frame = vec![0x94, 0xC3, (len >> 8) as u8, (len & 0xFF) as u8];
        frame.extend_from_slice(payload);
        frame
    }

    #[test]
    fn extract_frame_valid_payload() {
        let mut buf = make_frame(b"hello");
        let result = extract_frame(&mut buf);
        assert_eq!(result, Some(b"hello".to_vec()));
        assert!(buf.is_empty());
    }

    #[test]
    fn extract_frame_skips_garbage_prefix() {
        let mut buf = vec![0xFF, 0xAA, 0x00];
        buf.extend_from_slice(&make_frame(b"data"));
        let result = extract_frame(&mut buf);
        assert_eq!(result, Some(b"data".to_vec()));
        assert!(buf.is_empty());
    }

    #[test]
    fn extract_frame_returns_none_on_incomplete() {
        // Header + length says 10 bytes, but only 3 bytes of payload
        let mut buf = vec![0x94, 0xC3, 0x00, 0x0A, 0x01, 0x02, 0x03];
        let result = extract_frame(&mut buf);
        assert_eq!(result, None);
        // Buffer should be preserved for more data
        assert_eq!(buf.len(), 7);
    }

    #[test]
    fn extract_frame_returns_none_on_too_short() {
        let mut buf = vec![0x94, 0xC3];
        assert_eq!(extract_frame(&mut buf), None);
    }

    #[test]
    fn extract_frame_skips_zero_length() {
        // Zero length is invalid, should skip the header and try again
        let mut buf = vec![0x94, 0xC3, 0x00, 0x00];
        buf.extend_from_slice(&make_frame(b"ok"));
        let result = extract_frame(&mut buf);
        assert_eq!(result, Some(b"ok".to_vec()));
    }

    #[test]
    fn extract_frame_skips_oversized_length() {
        // Length > MAX_PACKET_SIZE (512), should skip
        let mut buf = vec![0x94, 0xC3, 0x08, 0x00]; // 2048 bytes
        buf.extend_from_slice(&make_frame(b"valid"));
        let result = extract_frame(&mut buf);
        assert_eq!(result, Some(b"valid".to_vec()));
    }

    #[test]
    fn extract_frame_multiple_frames() {
        let mut buf = make_frame(b"first");
        buf.extend_from_slice(&make_frame(b"second"));

        let r1 = extract_frame(&mut buf);
        assert_eq!(r1, Some(b"first".to_vec()));

        let r2 = extract_frame(&mut buf);
        assert_eq!(r2, Some(b"second".to_vec()));

        assert!(buf.is_empty());
    }
}
