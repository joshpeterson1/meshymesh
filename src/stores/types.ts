export type TransportType = "serial" | "wifi" | "ble";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface MeshUser {
  id: string;
  longName: string;
  shortName: string;
  hwModel: string;
  role: string;
}

export interface MeshPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  time: number;
}

export interface MeshNode {
  num: number;
  user: MeshUser;
  position?: MeshPosition;
  snr: number;
  lastHeard: number;
  hopsAway: number;
  batteryLevel?: number;
  voltage?: number;
  viaMqtt: boolean;
  isFavorite: boolean;
}

export interface MeshMessage {
  id: string;
  from: number;
  to: number;
  channel: number;
  text: string;
  timestamp: number;
  rxSnr?: number;
  rxRssi?: number;
  hopStart?: number;
  hopLimit?: number;
  ackStatus: "pending" | "acked" | "implicit" | "max_retransmit" | "failed" | "none";
}

export interface MeshChannel {
  index: number;
  name: string;
  role: "primary" | "secondary" | "disabled";
  psk: number[];
  uplinkEnabled: boolean;
  downlinkEnabled: boolean;
  positionPrecision: number;
  isClientMuted: boolean;
}

export interface LoraConfig {
  channelNum: number;
  modemPreset: string;
  region: string;
}

/** Raw device config sections as received from the device, keyed by config_type */
export type DeviceConfigs = Record<string, Record<string, unknown>>;

export interface NodeConnection {
  id: string;
  label: string;
  transport: TransportType;
  transportAddress: string;
  status: ConnectionStatus;
  errorMessage?: string;
  myNodeNum?: number;
  myUser?: MeshUser;
  channels: MeshChannel[];
  meshNodes: Record<number, MeshNode>;
  messages: MeshMessage[];
  batteryLevel?: number;
  voltage?: number;
  loraConfig?: LoraConfig;
  deviceConfigs: DeviceConfigs;
  lastActivity: number;
}

export type SidebarView = "conversations" | "nodes" | "map" | "settings";

export type UnifiedView =
  | "dashboard"
  | "all-messages"
  | "combined-map"
  | "connections";
