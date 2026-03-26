import { invoke } from "@tauri-apps/api/core";

export async function listSerialPorts(): Promise<string[]> {
  return invoke("list_serial_ports");
}

export async function connectSerial(
  port: string,
  label: string,
  baud?: number,
): Promise<string> {
  return invoke("connect_serial", { port, label, baud: baud ?? null });
}

export async function connectTcp(
  address: string,
  label: string,
): Promise<string> {
  return invoke("connect_tcp", { address, label });
}

export async function disconnectNode(connectionId: string): Promise<void> {
  return invoke("disconnect_node", { connectionId });
}

// Config editing commands
export async function setLoraConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_lora_config", { connectionId, config });
}

export async function setDeviceConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_device_config", { connectionId, config });
}

export async function setDisplayConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_display_config", { connectionId, config });
}

export async function setPowerConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_power_config", { connectionId, config });
}

export async function setPositionConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_position_config", { connectionId, config });
}

export async function setBluetoothConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_bluetooth_config", { connectionId, config });
}

export async function setSecurityConfig(connectionId: string, config: Record<string, unknown>): Promise<void> {
  return invoke("set_security_config", { connectionId, config });
}

export async function setChannel(connectionId: string, channel: Record<string, unknown>): Promise<void> {
  return invoke("set_channel", { connectionId, channel });
}

// Connection history
export interface ConnectionHistoryEntry {
  transport: string;
  address: string;
  label: string;
  short_name: string | null;
  last_connected: number;
}

export async function getConnectionHistory(): Promise<ConnectionHistoryEntry[]> {
  return invoke("get_connection_history");
}

export async function saveConnectionHistoryEntry(
  transport: string,
  address: string,
  label: string,
  shortName?: string,
): Promise<void> {
  return invoke("save_connection_history_entry", {
    transport,
    address,
    label,
    shortName: shortName ?? null,
  });
}

export async function forgetConnectionHistoryEntry(
  transport: string,
  address: string,
): Promise<void> {
  return invoke("forget_connection_history_entry", { transport, address });
}

export async function sendTextMessage(
  connectionId: string,
  localId: string,
  text: string,
  destination: number,
  channel: number,
  wantAck: boolean,
): Promise<void> {
  return invoke("send_text_message", {
    connectionId,
    localId,
    text,
    destination,
    channel,
    wantAck,
  });
}
