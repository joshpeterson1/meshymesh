use std::sync::Arc;
use std::time::Duration;

use meshtastic::protobufs::{self, from_radio, mesh_packet, PortNum, ToRadio};
use prost::Message as ProstMessage;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, RwLock};

use crate::events::*;
use crate::state::{ConnectionCommand, ConnectionManager};
use crate::transport::serial;

pub enum TransportKind {
    Serial { port: String, baud: Option<u32> },
    Tcp { address: String },
}

/// Result from an inner connection loop
enum ConnectionResult {
    /// User requested disconnect — do not retry
    CleanDisconnect,
    /// Connection lost unexpectedly — eligible for retry
    UnexpectedLoss(String),
    /// Failed to establish connection — eligible for retry
    ConnectFailed(String),
}

struct RetryConfig {
    max_attempts: u32,
    initial_delay: Duration,
    max_delay: Duration,
}

impl RetryConfig {
    fn for_serial() -> Self {
        Self {
            max_attempts: 5,
            initial_delay: Duration::from_secs(2),
            max_delay: Duration::from_secs(30),
        }
    }

    fn for_tcp() -> Self {
        Self {
            max_attempts: 10,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
        }
    }

    fn delay_for_attempt(&self, attempt: u32) -> Duration {
        let secs = self.initial_delay.as_secs_f64() * 2.0_f64.powi(attempt as i32);
        Duration::from_secs_f64(secs.min(self.max_delay.as_secs_f64()))
    }
}

pub async fn run_connection(
    app: AppHandle,
    conn_id: String,
    transport: TransportKind,
    mut command_rx: mpsc::Receiver<ConnectionCommand>,
    manager: Arc<RwLock<ConnectionManager>>,
) {
    let emit = |event: &NodeEvent| {
        let _ = app.emit("node-event", event);
    };

    let retry_config = match &transport {
        TransportKind::Serial { .. } => RetryConfig::for_serial(),
        TransportKind::Tcp { .. } => RetryConfig::for_tcp(),
    };

    let mut attempt = 0u32;

    loop {
        emit(&NodeEvent::ConnectionStatus {
            connection_id: conn_id.clone(),
            status: if attempt == 0 { "connecting" } else { "reconnecting" }.into(),
            error: None,
        });

        let result = match &transport {
            TransportKind::Serial { ref port, baud } => {
                run_serial_connection(
                    &app,
                    &conn_id,
                    port,
                    baud.unwrap_or(115_200),
                    &mut command_rx,
                )
                .await
            }
            TransportKind::Tcp { ref address } => {
                run_tcp_connection(
                    &app,
                    &conn_id,
                    address,
                    &mut command_rx,
                )
                .await
            }
        };

        match result {
            ConnectionResult::CleanDisconnect => {
                emit(&NodeEvent::ConnectionStatus {
                    connection_id: conn_id.clone(),
                    status: "disconnected".into(),
                    error: None,
                });
                break;
            }
            ConnectionResult::UnexpectedLoss(ref err) | ConnectionResult::ConnectFailed(ref err) => {
                attempt += 1;
                if attempt > retry_config.max_attempts {
                    log::warn!("[{}] Max reconnect attempts ({}) reached, giving up", conn_id, retry_config.max_attempts);
                    emit(&NodeEvent::ConnectionStatus {
                        connection_id: conn_id.clone(),
                        status: "error".into(),
                        error: Some(format!("{} (gave up after {} retries)", err, retry_config.max_attempts)),
                    });
                    break;
                }

                let delay = retry_config.delay_for_attempt(attempt - 1);
                log::info!("[{}] Connection lost: {}. Retry {}/{} in {:?}", conn_id, err, attempt, retry_config.max_attempts, delay);

                emit(&NodeEvent::ConnectionStatus {
                    connection_id: conn_id.clone(),
                    status: "reconnecting".into(),
                    error: Some(format!("Retry {}/{} in {}s...", attempt, retry_config.max_attempts, delay.as_secs())),
                });

                // Wait for delay, but check for Disconnect command
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    cmd = command_rx.recv() => {
                        if matches!(cmd, Some(ConnectionCommand::Disconnect) | None) {
                            log::info!("[{}] Disconnect during reconnect backoff", conn_id);
                            emit(&NodeEvent::ConnectionStatus {
                                connection_id: conn_id.clone(),
                                status: "disconnected".into(),
                                error: None,
                            });
                            break;
                        }
                        // Other commands during reconnect are dropped (not connected)
                    }
                }
            }
        }
    }

    cleanup(&manager, &conn_id).await;
}

/// Serial connection using our own framing (bypasses meshtastic crate's broken stream_buffer)
async fn run_serial_connection(
    app: &AppHandle,
    conn_id: &str,
    port: &str,
    baud: u32,
    command_rx: &mut mpsc::Receiver<ConnectionCommand>,
) -> ConnectionResult {
    let emit = |event: &NodeEvent| {
        let _ = app.emit("node-event", event);
    };

    // Open serial with our own handler
    let (mut from_radio_rx, to_radio_tx) = match serial::open_serial(port, baud).await {
        Ok(channels) => channels,
        Err(e) => {
            return ConnectionResult::ConnectFailed(e);
        }
    };

    emit(&NodeEvent::ConnectionStatus {
        connection_id: conn_id.to_string(),
        status: "connected".into(),
        error: None,
    });

    // Send WantConfigId to start the config handshake
    let config_id = rand::random::<u32>();
    let want_config = ToRadio {
        payload_variant: Some(protobufs::to_radio::PayloadVariant::WantConfigId(config_id)),
    };
    if to_radio_tx.send(want_config).await.is_err() {
        return ConnectionResult::ConnectFailed("Failed to send config request".into());
    }

    log::info!("[{}] Sent WantConfigId: {}", conn_id, config_id);

    let mut my_node_num: u32 = 0;
    let mut config_complete = false;
    let mut user_disconnect = false;

    // Main select! loop
    loop {
        tokio::select! {
            packet = from_radio_rx.recv() => {
                match packet {
                    Some(from_radio) => {
                        let is_config_complete = process_from_radio(
                            app, conn_id, from_radio, &mut my_node_num,
                        );
                        if is_config_complete && !config_complete {
                            config_complete = true;
                            emit(&NodeEvent::ConfigComplete {
                                connection_id: conn_id.to_string(),
                            });
                            log::info!("[{}] Config complete, node_num={}", conn_id, my_node_num);
                        }
                    }
                    None => {
                        log::warn!("[{}] Serial reader closed", conn_id);
                        return ConnectionResult::UnexpectedLoss("Serial connection lost".into());
                    }
                }
            }

            cmd = command_rx.recv() => {
                match cmd {
                    Some(ConnectionCommand::SendText { local_id, text, destination, channel, want_ack, reply_id, emoji }) => {
                        log::info!("[{}] Sending text: '{}' to {} on ch {}", conn_id, text, destination, channel);

                        let packet = build_text_packet(
                            0, &text, destination, channel, want_ack, reply_id, emoji,
                        );
                        let packet_id = packet.id;
                        log::info!("[{}] MeshPacket: from={} to={} id={} channel={} want_ack={} hop_limit={} hop_start={}",
                            conn_id, packet.from, packet.to, packet.id, packet.channel, packet.want_ack, packet.hop_limit, packet.hop_start);
                        let to_radio = ToRadio {
                            payload_variant: Some(protobufs::to_radio::PayloadVariant::Packet(packet)),
                        };
                        match to_radio_tx.send(to_radio).await {
                            Ok(()) => {
                                log::info!("[{}] Text message sent, packet_id={}", conn_id, packet_id);
                                emit(&NodeEvent::MessageSent {
                                    connection_id: conn_id.to_string(),
                                    local_id,
                                    packet_id,
                                });
                            }
                            Err(e) => log::error!("[{}] Failed to queue text message: {}", conn_id, e),
                        }
                    }
                    Some(ConnectionCommand::SendAdmin { admin_bytes, packet_id }) => {
                        let packet = build_admin_packet(my_node_num, &admin_bytes, packet_id);
                        log::info!("[{}] Sending admin packet to node {} (id={}, {} bytes)", conn_id, my_node_num, packet_id, admin_bytes.len());
                        let to_radio = ToRadio {
                            payload_variant: Some(protobufs::to_radio::PayloadVariant::Packet(packet)),
                        };
                        if let Err(e) = to_radio_tx.send(to_radio).await {
                            log::error!("[{}] Failed to queue admin message: {}", conn_id, e);
                        }
                    }
                    Some(ConnectionCommand::Disconnect) => {
                        log::info!("[{}] Disconnect requested", conn_id);
                        user_disconnect = true;
                        break;
                    }
                    None => {
                        log::warn!("[{}] Command channel closed", conn_id);
                        user_disconnect = true;
                        break;
                    }
                }
            }
        }
    }

    if user_disconnect {
        ConnectionResult::CleanDisconnect
    } else {
        ConnectionResult::UnexpectedLoss("Serial connection lost".into())
    }
}

/// TCP connection using the meshtastic crate's StreamApi (works fine for TCP)
async fn run_tcp_connection(
    app: &AppHandle,
    conn_id: &str,
    address: &str,
    command_rx: &mut mpsc::Receiver<ConnectionCommand>,
) -> ConnectionResult {
    use meshtastic::api::StreamApi;
    use meshtastic::packet::PacketDestination;
    use meshtastic::types::MeshChannel;
    use meshtastic::utils;

    let emit = |event: &NodeEvent| {
        let _ = app.emit("node-event", event);
    };

    let stream_api = StreamApi::new();
    let stream = match utils::stream::build_tcp_stream(address.to_string()).await {
        Ok(s) => s,
        Err(e) => {
            return ConnectionResult::ConnectFailed(format!("TCP connect failed: {}", e));
        }
    };

    let (mut packet_rx, stream_api) = stream_api.connect(stream).await;

    emit(&NodeEvent::ConnectionStatus {
        connection_id: conn_id.to_string(),
        status: "connected".into(),
        error: None,
    });

    let config_id = utils::generate_rand_id();
    let mut stream_api = match stream_api.configure(config_id).await {
        Ok(api) => api,
        Err(e) => {
            return ConnectionResult::ConnectFailed(format!("Configure failed: {}", e));
        }
    };

    emit(&NodeEvent::ConfigComplete {
        connection_id: conn_id.to_string(),
    });

    let (echo_tx, mut echo_rx) = mpsc::channel(32);
    let mut router = crate::transport::router::EchoRouter::new(0, echo_tx);
    let mut my_node_num: u32 = 0;
    let mut user_disconnect = false;

    loop {
        tokio::select! {
            packet = packet_rx.recv() => {
                match packet {
                    Some(from_radio) => {
                        process_from_radio(app, conn_id, from_radio, &mut my_node_num);
                    }
                    None => {
                        let _ = stream_api.disconnect().await;
                        return ConnectionResult::UnexpectedLoss("TCP connection lost".into());
                    }
                }
            }
            echoed = echo_rx.recv() => {
                if let Some(_packet) = echoed {}
            }
            cmd = command_rx.recv() => {
                match cmd {
                    Some(ConnectionCommand::SendText { local_id, text, destination, channel, want_ack, reply_id, emoji }) => {
                        if reply_id == 0 && emoji == 0 {
                            // Regular text message — use crate helper for echo routing
                            let dest = if destination == 0xFFFFFFFF {
                                PacketDestination::Broadcast
                            } else {
                                PacketDestination::Node(destination.into())
                            };
                            let mesh_channel = MeshChannel::new(channel).unwrap_or_default();
                            match stream_api.send_text(&mut router, text.clone(), dest, want_ack, mesh_channel).await {
                                Ok(()) => {
                                    if let Ok(echoed_packet) = echo_rx.try_recv() {
                                        let packet_id = echoed_packet.id;
                                        log::info!("[{}] TCP text sent, packet_id={}", conn_id, packet_id);
                                        emit(&NodeEvent::MessageSent {
                                            connection_id: conn_id.to_string(),
                                            local_id,
                                            packet_id,
                                        });
                                    } else {
                                        log::warn!("[{}] TCP text sent but no echo received for local_id={}", conn_id, local_id);
                                    }
                                }
                                Err(e) => {
                                    log::error!("[{}] TCP send text failed: {}", conn_id, e);
                                }
                            }
                        } else {
                            // Reaction or reply — build packet manually (crate helper doesn't support emoji/reply_id)
                            let packet = build_text_packet(0, &text, destination, channel, want_ack, reply_id, emoji);
                            let packet_id = packet.id;
                            let to_radio = ToRadio {
                                payload_variant: Some(protobufs::to_radio::PayloadVariant::Packet(packet)),
                            };
                            match stream_api.send_to_radio_packet(to_radio.payload_variant).await {
                                Ok(()) => {
                                    log::info!("[{}] TCP reaction sent, packet_id={}", conn_id, packet_id);
                                    emit(&NodeEvent::MessageSent {
                                        connection_id: conn_id.to_string(),
                                        local_id,
                                        packet_id,
                                    });
                                }
                                Err(e) => log::error!("[{}] TCP reaction send failed: {}", conn_id, e),
                            }
                        }
                    }
                    Some(ConnectionCommand::SendAdmin { admin_bytes, packet_id }) => {
                        let packet = build_admin_packet(my_node_num, &admin_bytes, packet_id);
                        log::info!("[{}] TCP sending admin packet (id={}, {} bytes)", conn_id, packet_id, admin_bytes.len());
                        let to_radio = ToRadio {
                            payload_variant: Some(protobufs::to_radio::PayloadVariant::Packet(packet)),
                        };
                        if let Err(e) = stream_api.send_to_radio_packet(to_radio.payload_variant).await {
                            log::error!("[{}] TCP admin send failed: {}", conn_id, e);
                        }
                    }
                    Some(ConnectionCommand::Disconnect) => {
                        user_disconnect = true;
                        break;
                    }
                    None => {
                        user_disconnect = true;
                        break;
                    }
                }
            }
        }
    }

    let _ = stream_api.disconnect().await;

    if user_disconnect {
        ConnectionResult::CleanDisconnect
    } else {
        ConnectionResult::UnexpectedLoss("TCP connection lost".into())
    }
}

/// Build a MeshPacket for sending a text message or emoji reaction
fn build_text_packet(
    from: u32,
    text: &str,
    destination: u32,
    channel: u32,
    want_ack: bool,
    reply_id: u32,
    emoji: u32,
) -> protobufs::MeshPacket {
    let data = protobufs::Data {
        portnum: PortNum::TextMessageApp as i32,
        payload: text.as_bytes().to_vec(),
        want_response: false,
        reply_id,
        emoji,
        ..Default::default()
    };

    let id = rand::random::<u32>();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as u32;

    protobufs::MeshPacket {
        from,
        to: destination,
        channel,
        want_ack,
        id,
        rx_time: now,
        payload_variant: Some(mesh_packet::PayloadVariant::Decoded(data)),
        ..Default::default()
    }
}

/// Process a FromRadio packet, emitting events to the frontend.
/// Returns true if this was a ConfigCompleteId packet.
fn process_from_radio(
    app: &AppHandle,
    conn_id: &str,
    from_radio: protobufs::FromRadio,
    my_node_num: &mut u32,
) -> bool {
    let emit = |event: &NodeEvent| {
        let _ = app.emit("node-event", event);
    };

    let Some(variant) = from_radio.payload_variant else {
        return false;
    };

    match variant {
        from_radio::PayloadVariant::MyInfo(info) => {
            log::info!("[{}] MyNodeInfo: node_num={}", conn_id, info.my_node_num);
            *my_node_num = info.my_node_num;
            emit(&NodeEvent::MyNodeInfo {
                connection_id: conn_id.to_string(),
                my_node_num: info.my_node_num,
            });
        }

        from_radio::PayloadVariant::NodeInfo(node_info) => {
            log::info!(
                "[{}] NodeInfo: num={} name={}",
                conn_id,
                node_info.num,
                node_info.user.as_ref().map(|u| u.long_name.as_str()).unwrap_or("?")
            );
            let user = node_info.user.as_ref().map(user_info_from_proto);
            let position = node_info.position.as_ref().map(position_info_from_proto);
            let device_metrics = node_info
                .device_metrics
                .as_ref()
                .map(device_metrics_from_proto);

            emit(&NodeEvent::NodeDiscovered {
                connection_id: conn_id.to_string(),
                num: node_info.num,
                user,
                position,
                snr: node_info.snr,
                last_heard: node_info.last_heard,
                hops_away: node_info.hops_away,
                via_mqtt: node_info.via_mqtt,
                is_favorite: node_info.is_favorite,
                device_metrics,
            });
        }

        from_radio::PayloadVariant::Channel(channel) => {
            let role_str = match protobufs::channel::Role::try_from(channel.role) {
                Ok(protobufs::channel::Role::Primary) => "primary",
                Ok(protobufs::channel::Role::Secondary) => "secondary",
                _ => "disabled",
            };
            let settings = channel.settings.as_ref();
            let name = settings.map(|s| s.name.clone()).unwrap_or_default();
            let psk = settings.map(|s| s.psk.clone()).unwrap_or_default();
            let uplink_enabled = settings.map(|s| s.uplink_enabled).unwrap_or(false);
            let downlink_enabled = settings.map(|s| s.downlink_enabled).unwrap_or(false);
            let module_settings = settings.and_then(|s| s.module_settings.as_ref());
            let position_precision = module_settings.map(|m| m.position_precision).unwrap_or(0);
            let is_client_muted = module_settings.map(|m| m.is_client_muted).unwrap_or(false);

            log::info!("[{}] Channel: idx={} name='{}' role={} psk_len={} uplink={} downlink={}", conn_id, channel.index, name, role_str, psk.len(), uplink_enabled, downlink_enabled);
            emit(&NodeEvent::ChannelReceived {
                connection_id: conn_id.to_string(),
                index: channel.index,
                name: if name.is_empty() && role_str == "primary" {
                    "Primary".to_string()
                } else {
                    name
                },
                role: role_str.to_string(),
                psk,
                uplink_enabled,
                downlink_enabled,
                position_precision,
                is_client_muted,
            });
        }

        from_radio::PayloadVariant::Packet(mesh_packet) => {
            process_mesh_packet(app, conn_id, &mesh_packet);
        }

        from_radio::PayloadVariant::ConfigCompleteId(id) => {
            log::info!("[{}] ConfigCompleteId: {}", conn_id, id);
            return true;
        }

        from_radio::PayloadVariant::Config(config) => {
            if let Some(ref variant) = config.payload_variant {
                let (config_type, config_json) = serialize_config_variant(variant);
                log::info!("[{}] Config received: {}", conn_id, config_type);

                // Keep the existing LoraConfigReceived event for sidebar slot grouping
                if let protobufs::config::PayloadVariant::Lora(ref lora) = variant {
                    let modem_preset = protobufs::config::lo_ra_config::ModemPreset::try_from(lora.modem_preset)
                        .map(|m| m.as_str_name().to_string())
                        .unwrap_or_else(|_| format!("UNKNOWN({})", lora.modem_preset));
                    let region = protobufs::config::lo_ra_config::RegionCode::try_from(lora.region)
                        .map(|r| r.as_str_name().to_string())
                        .unwrap_or_else(|_| format!("UNKNOWN({})", lora.region));
                    emit(&NodeEvent::LoraConfigReceived {
                        connection_id: conn_id.to_string(),
                        channel_num: lora.channel_num,
                        modem_preset,
                        region,
                    });
                }

                // Emit the full config payload for the settings editor
                emit(&NodeEvent::DeviceConfigReceived {
                    connection_id: conn_id.to_string(),
                    config_type,
                    config: config_json,
                });
            }
        }

        from_radio::PayloadVariant::ModuleConfig(_) => {
            log::debug!("[{}] ModuleConfig packet (skipping)", conn_id);
        }

        _ => {
            log::debug!("[{}] Unhandled FromRadio variant", conn_id);
        }
    }

    false
}

fn process_mesh_packet(app: &AppHandle, conn_id: &str, packet: &protobufs::MeshPacket) {
    let emit = |event: &NodeEvent| {
        let _ = app.emit("node-event", event);
    };

    let Some(mesh_packet::PayloadVariant::Decoded(ref data)) = packet.payload_variant else {
        return;
    };

    let port = PortNum::try_from(data.portnum).unwrap_or(PortNum::UnknownApp);

    match port {
        PortNum::TextMessageApp => {
            let text = String::from_utf8_lossy(&data.payload).to_string();
            if data.emoji != 0 {
                log::info!("[{}] Reaction from {} to msg {}: '{}'", conn_id, packet.from, data.reply_id, text);
            } else {
                log::info!("[{}] Message from {} to {}: '{}'", conn_id, packet.from, packet.to, text);
            }
            emit(&NodeEvent::MessageReceived {
                connection_id: conn_id.to_string(),
                id: packet.id,
                from: packet.from,
                to: packet.to,
                channel: packet.channel,
                text,
                rx_time: packet.rx_time,
                rx_snr: packet.rx_snr,
                rx_rssi: packet.rx_rssi,
                hop_start: packet.hop_start,
                hop_limit: packet.hop_limit,
                via_mqtt: packet.via_mqtt,
                emoji: data.emoji,
                reply_id: data.reply_id,
            });
        }

        PortNum::PositionApp => {
            if let Ok(pos) = protobufs::Position::decode(data.payload.as_slice()) {
                emit(&NodeEvent::NodeDiscovered {
                    connection_id: conn_id.to_string(),
                    num: packet.from,
                    user: None,
                    position: Some(position_info_from_proto(&pos)),
                    snr: packet.rx_snr,
                    last_heard: packet.rx_time,
                    hops_away: None,
                    via_mqtt: packet.via_mqtt,
                    is_favorite: false,
                    device_metrics: None,
                });
            }
        }

        PortNum::NodeinfoApp => {
            if let Ok(user) = protobufs::User::decode(data.payload.as_slice()) {
                emit(&NodeEvent::UserUpdate {
                    connection_id: conn_id.to_string(),
                    num: packet.from,
                    user: user_info_from_proto(&user),
                });
            }
        }

        PortNum::TelemetryApp => {
            if let Ok(telemetry) = protobufs::Telemetry::decode(data.payload.as_slice()) {
                if let Some(protobufs::telemetry::Variant::DeviceMetrics(dm)) = telemetry.variant {
                    emit(&NodeEvent::DeviceMetricsUpdate {
                        connection_id: conn_id.to_string(),
                        node_num: packet.from,
                        rx_time: packet.rx_time,
                        battery_level: dm.battery_level,
                        voltage: dm.voltage,
                        channel_utilization: dm.channel_utilization,
                        air_util_tx: dm.air_util_tx,
                        uptime_seconds: dm.uptime_seconds,
                    });
                }
            }
        }

        PortNum::RoutingApp => {
            if let Ok(routing) = protobufs::Routing::decode(data.payload.as_slice()) {
                log::info!("[{}] Routing: variant={:?} request_id={} from={}", conn_id, routing.variant, data.request_id, packet.from);
                if let Some(protobufs::routing::Variant::ErrorReason(reason)) = routing.variant {
                    log::info!("[{}] ACK for request_id={}: error_reason={} from={}", conn_id, data.request_id, reason, packet.from);
                    emit(&NodeEvent::MessageAck {
                        connection_id: conn_id.to_string(),
                        request_id: data.request_id,
                        from: packet.from,
                        error_reason: reason,
                    });
                }
            }
        }

        _ => {
            log::debug!("[{}] Unhandled portnum: {:?}", conn_id, port);
        }
    }
}

fn user_info_from_proto(user: &protobufs::User) -> UserInfo {
    let hw_model = protobufs::HardwareModel::try_from(user.hw_model)
        .map(|h| h.as_str_name().to_string())
        .unwrap_or_else(|_| format!("UNKNOWN({})", user.hw_model));

    let role = protobufs::config::device_config::Role::try_from(user.role)
        .map(|r| r.as_str_name().to_string())
        .unwrap_or_else(|_| {
            // Roles added after meshtastic crate v0.1.8
            match user.role {
                12 => "CLIENT_BASE".to_string(),
                other => format!("UNKNOWN({})", other),
            }
        });

    let public_key = if user.public_key.is_empty() {
        String::new()
    } else {
        user.public_key.iter().map(|b| format!("{:02x}", b)).collect::<String>()
    };

    UserInfo {
        id: user.id.clone(),
        long_name: user.long_name.clone(),
        short_name: user.short_name.clone(),
        hw_model,
        role,
        has_public_key: !user.public_key.is_empty(),
        public_key,
    }
}

fn position_info_from_proto(pos: &protobufs::Position) -> PositionInfo {
    PositionInfo {
        latitude: pos.latitude_i.unwrap_or(0) as f64 * 1e-7,
        longitude: pos.longitude_i.unwrap_or(0) as f64 * 1e-7,
        altitude: pos.altitude.filter(|&a| a != 0),
        time: pos.time,
    }
}

fn device_metrics_from_proto(dm: &protobufs::DeviceMetrics) -> DeviceMetricsInfo {
    DeviceMetricsInfo {
        battery_level: dm.battery_level,
        voltage: dm.voltage,
        channel_utilization: dm.channel_utilization,
        air_util_tx: dm.air_util_tx,
        uptime_seconds: dm.uptime_seconds,
    }
}

/// Build a MeshPacket for sending an AdminMessage to the local node.
fn build_admin_packet(my_node_num: u32, admin_bytes: &[u8], packet_id: u32) -> protobufs::MeshPacket {
    let data = protobufs::Data {
        portnum: PortNum::AdminApp as i32,
        payload: admin_bytes.to_vec(),
        want_response: true, // AdminApp: request a response so we get the updated config back
        ..Default::default()
    };

    protobufs::MeshPacket {
        from: 0, // firmware fills in
        to: my_node_num,
        want_ack: true,
        id: packet_id,
        payload_variant: Some(mesh_packet::PayloadVariant::Decoded(data)),
        ..Default::default()
    }
}

/// Serialize a Config variant to (type_name, JSON value) for the frontend settings editor.
fn serialize_config_variant(variant: &protobufs::config::PayloadVariant) -> (String, serde_json::Value) {
    match variant {
        protobufs::config::PayloadVariant::Device(c) => {
            ("device".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Position(c) => {
            ("position".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Power(c) => {
            ("power".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Network(c) => {
            ("network".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Display(c) => {
            ("display".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Lora(c) => {
            ("lora".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Bluetooth(c) => {
            ("bluetooth".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Security(c) => {
            ("security".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::Sessionkey(c) => {
            ("sessionkey".into(), serde_json::to_value(c).unwrap_or_default())
        }
        protobufs::config::PayloadVariant::DeviceUi(c) => {
            ("device_ui".into(), serde_json::to_value(c).unwrap_or_default())
        }
    }
}

async fn cleanup(manager: &Arc<RwLock<ConnectionManager>>, conn_id: &str) {
    let mut mgr = manager.write().await;
    mgr.remove(conn_id);
}
