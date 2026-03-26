use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", content = "payload")]
pub enum NodeEvent {
    ConnectionStatus {
        connection_id: String,
        status: String,
        error: Option<String>,
    },
    MyNodeInfo {
        connection_id: String,
        my_node_num: u32,
    },
    NodeDiscovered {
        connection_id: String,
        num: u32,
        user: Option<UserInfo>,
        position: Option<PositionInfo>,
        snr: f32,
        last_heard: u32,
        hops_away: Option<u32>,
        via_mqtt: bool,
        is_favorite: bool,
        device_metrics: Option<DeviceMetricsInfo>,
    },
    ChannelReceived {
        connection_id: String,
        index: i32,
        name: String,
        role: String,
        psk: Vec<u8>,
        uplink_enabled: bool,
        downlink_enabled: bool,
        position_precision: u32,
        is_client_muted: bool,
    },
    MessageReceived {
        connection_id: String,
        id: u32,
        from: u32,
        to: u32,
        channel: u32,
        text: String,
        rx_time: u32,
        rx_snr: f32,
        rx_rssi: i32,
        hop_start: u32,
        hop_limit: u32,
        via_mqtt: bool,
    },
    DeviceMetricsUpdate {
        connection_id: String,
        node_num: u32,
        battery_level: Option<u32>,
        voltage: Option<f32>,
        channel_utilization: Option<f32>,
        air_util_tx: Option<f32>,
        uptime_seconds: Option<u32>,
    },
    MessageSent {
        connection_id: String,
        local_id: String,
        packet_id: u32,
    },
    MessageAck {
        connection_id: String,
        request_id: u32,
        /// Node that sent the ACK — compare with original destination to detect implicit ACKs
        from: u32,
        /// Raw Meshtastic Routing::Error code (0 = NONE/success, 5 = MAX_RETRANSMIT, etc.)
        error_reason: i32,
    },
    LoraConfigReceived {
        connection_id: String,
        channel_num: u32,
        modem_preset: String,
        region: String,
    },
    DeviceConfigReceived {
        connection_id: String,
        config_type: String,
        config: serde_json::Value,
    },
    ConfigComplete {
        connection_id: String,
    },
    UserUpdate {
        connection_id: String,
        num: u32,
        user: UserInfo,
    },
}

#[derive(Serialize, Clone, Debug)]
pub struct UserInfo {
    pub id: String,
    pub long_name: String,
    pub short_name: String,
    pub hw_model: String,
    pub role: String,
    pub has_public_key: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct PositionInfo {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: Option<i32>,
    pub time: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct DeviceMetricsInfo {
    pub battery_level: Option<u32>,
    pub voltage: Option<f32>,
    pub channel_utilization: Option<f32>,
    pub air_util_tx: Option<f32>,
    pub uptime_seconds: Option<u32>,
}
