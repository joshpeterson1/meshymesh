import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useNodeStore } from "@/stores/nodeStore";
import { saveConnectionHistoryEntry, getAppSettings } from "@/lib/tauri";
import { notifyAdminAck } from "@/lib/adminTracker";
import {
  loadCachedMessages,
  saveCachedMessages,
  appendCachedMessage,
  saveCachedNodes,
  cleanStaleNodes,
} from "@/lib/cache";
import type {
  MeshNode,
  MeshUser,
  MeshMessage,
  MeshChannel,
  ConnectionStatus,
} from "@/stores/types";

// Rust event payload types (snake_case from serde)
interface RustUserInfo {
  id: string;
  long_name: string;
  short_name: string;
  hw_model: string;
  role: string;
  has_public_key: boolean;
  public_key: string;
}

interface RustPositionInfo {
  latitude: number;
  longitude: number;
  altitude: number | null;
  time: number;
}

interface RustDeviceMetricsInfo {
  battery_level: number | null;
  voltage: number | null;
  channel_utilization: number | null;
  air_util_tx: number | null;
  uptime_seconds: number | null;
}

type NodeEvent =
  | {
      kind: "ConnectionStatus";
      payload: {
        connection_id: string;
        status: string;
        error: string | null;
      };
    }
  | {
      kind: "MyNodeInfo";
      payload: { connection_id: string; my_node_num: number };
    }
  | {
      kind: "NodeDiscovered";
      payload: {
        connection_id: string;
        num: number;
        user: RustUserInfo | null;
        position: RustPositionInfo | null;
        snr: number;
        last_heard: number;
        hops_away: number | null;
        via_mqtt: boolean;
        is_favorite: boolean;
        device_metrics: RustDeviceMetricsInfo | null;
      };
    }
  | {
      kind: "ChannelReceived";
      payload: {
        connection_id: string;
        index: number;
        name: string;
        role: string;
        psk: number[];
        uplink_enabled: boolean;
        downlink_enabled: boolean;
        position_precision: number;
        is_client_muted: boolean;
      };
    }
  | {
      kind: "MessageReceived";
      payload: {
        connection_id: string;
        id: number;
        from: number;
        to: number;
        channel: number;
        text: string;
        rx_time: number;
        rx_snr: number;
        rx_rssi: number;
        hop_start: number;
        hop_limit: number;
        via_mqtt: boolean;
        emoji: number;
        reply_id: number;
      };
    }
  | {
      kind: "DeviceMetricsUpdate";
      payload: {
        connection_id: string;
        node_num: number;
        rx_time: number;
        battery_level: number | null;
        voltage: number | null;
        channel_utilization: number | null;
        air_util_tx: number | null;
        uptime_seconds: number | null;
      };
    }
  | {
      kind: "MessageSent";
      payload: {
        connection_id: string;
        local_id: string;
        packet_id: number;
      };
    }
  | {
      kind: "MessageAck";
      payload: {
        connection_id: string;
        request_id: number;
        from: number;
        error_reason: number;
      };
    }
  | {
      kind: "DeviceConfigReceived";
      payload: {
        connection_id: string;
        config_type: string;
        config: Record<string, unknown>;
      };
    }
  | {
      kind: "LoraConfigReceived";
      payload: {
        connection_id: string;
        channel_num: number;
        modem_preset: string;
        region: string;
      };
    }
  | { kind: "ConfigComplete"; payload: { connection_id: string } }
  | {
      kind: "UserUpdate";
      payload: {
        connection_id: string;
        num: number;
        user: RustUserInfo;
      };
    };

function mapUser(ru: RustUserInfo): MeshUser {
  return {
    id: ru.id,
    longName: ru.long_name,
    shortName: ru.short_name,
    hwModel: ru.hw_model,
    role: ru.role,
    hasPublicKey: ru.has_public_key,
    publicKey: ru.public_key || undefined,
  };
}

export function useMeshtasticEvents() {
  useEffect(() => {
    const unlisten = listen<NodeEvent>("node-event", (event) => {
      const data = event.payload;
      const store = useNodeStore.getState();

      switch (data.kind) {
        case "ConnectionStatus": {
          const { connection_id, status, error } = data.payload;

          // If this is a new connection we haven't seen, create a skeleton
          if (!store.connections[connection_id] && status === "connecting") {
            // Skeleton will be filled in by subsequent events
            // The connection metadata (label, transport, address) is set by
            // the addConnection call in the dialog before events arrive
          }

          store.updateConnectionStatus(
            connection_id,
            status as ConnectionStatus,
            error ?? undefined,
          );

          // Toast for connection state changes
          const csConn = store.connections[connection_id];
          const csLabel = csConn?.myUser?.shortName || csConn?.label || connection_id.slice(0, 8);
          if (status === "error") {
            toast.error(error ?? "Connection error", { description: csLabel });
          } else if (status === "disconnected" && error) {
            toast.warning("Connection lost", { description: `${csLabel}: ${error}` });
          }
          break;
        }

        case "MyNodeInfo": {
          const { connection_id, my_node_num } = data.payload;
          // Store the node num; user info arrives via NodeDiscovered/UserUpdate
          const conn = store.connections[connection_id];
          if (conn) {
            store.setMyNodeInfo(
              connection_id,
              my_node_num,
              conn.myUser ?? {
                id: `!${my_node_num.toString(16)}`,
                longName: "My Node",
                shortName: "ME",
                hwModel: "",
                role: "CLIENT",
                hasPublicKey: false,
              },
            );
          }
          break;
        }

        case "NodeDiscovered": {
          const p = data.payload;
          // Preserve existing node data when the event has null/zero fields.
          // NodeDiscovered fires from both handshake NodeInfo (stale snapshots)
          // and live PositionApp packets. Use the newer data when both exist.
          const existingNode = store.connections[p.connection_id]?.meshNodes[p.num];
          const eventLastHeard = p.last_heard || 0;
          const existingLastHeard = existingNode?.lastHeard || 0;
          const eventIsNewer = eventLastHeard >= existingLastHeard;

          const defaultUser = {
            id: `!${p.num.toString(16)}`,
            longName: `Node ${p.num.toString(16)}`,
            shortName: p.num.toString(16).slice(-4).toUpperCase(),
            hwModel: "",
            role: "CLIENT",
            hasPublicKey: false,
          };
          const node: MeshNode = {
            num: p.num,
            user: p.user
              ? mapUser(p.user)
              : existingNode?.user ?? defaultUser,
            // Position and signal fields: only overwrite if this event is newer
            position: p.position
              ? {
                  latitude: p.position.latitude,
                  longitude: p.position.longitude,
                  altitude: p.position.altitude ?? 0,
                  time: p.position.time,
                }
              : existingNode?.position,
            snr: eventIsNewer ? p.snr : (existingNode?.snr ?? p.snr),
            lastHeard: Math.max(eventLastHeard, existingLastHeard),
            hopsAway: eventIsNewer
              ? (p.hops_away ?? existingNode?.hopsAway ?? 0)
              : (existingNode?.hopsAway ?? p.hops_away ?? 0),
            // Device metrics: only use as initial values, live DeviceMetricsUpdate takes priority
            batteryLevel: existingNode?.batteryLevel ?? p.device_metrics?.battery_level ?? undefined,
            voltage: existingNode?.voltage ?? p.device_metrics?.voltage ?? undefined,
            viaMqtt: eventIsNewer ? p.via_mqtt : (existingNode?.viaMqtt ?? p.via_mqtt),
            isFavorite: p.is_favorite || existingNode?.isFavorite || false,
            firstHeard: existingNode?.firstHeard ?? Math.floor(Date.now() / 1000),
            uptimeSeconds: existingNode?.uptimeSeconds ?? p.device_metrics?.uptime_seconds ?? undefined,
            channelUtilization: existingNode?.channelUtilization ?? p.device_metrics?.channel_utilization ?? undefined,
            airUtilTx: existingNode?.airUtilTx ?? p.device_metrics?.air_util_tx ?? undefined,
            metricsLog: existingNode?.metricsLog,
          };
          store.upsertMeshNode(p.connection_id, node);

          // Persist nodes to cache (debounced by nature of event frequency)
          const ndConn = useNodeStore.getState().connections[p.connection_id];
          if (ndConn) {
            saveCachedNodes(ndConn.transport, ndConn.transportAddress, ndConn.meshNodes).catch((e) => console.warn("Failed to cache nodes:", e));
          }

          // If this is our own node, update myUser
          const conn = store.connections[p.connection_id];
          if (conn && conn.myNodeNum === p.num && p.user) {
            store.setMyNodeInfo(
              p.connection_id,
              p.num,
              mapUser(p.user),
            );
          }
          break;
        }

        case "ChannelReceived": {
          const {
            connection_id, index, name, role,
            psk, uplink_enabled, downlink_enabled,
            position_precision, is_client_muted,
          } = data.payload;
          const conn = store.connections[connection_id];
          if (conn) {
            const channel: MeshChannel = {
              index,
              name,
              role: role as MeshChannel["role"],
              psk: psk ?? [],
              uplinkEnabled: uplink_enabled,
              downlinkEnabled: downlink_enabled,
              positionPrecision: position_precision,
              isClientMuted: is_client_muted,
            };
            const existing = conn.channels.filter((c) => c.index !== index);
            store.setChannels(connection_id, [...existing, channel].sort((a, b) => a.index - b.index));
          }
          break;
        }

        case "MessageReceived": {
          const p = data.payload;

          // Any message from a node is "hearing" from it — update lastHeard
          if (p.rx_time > 0) {
            store.updateNodeLastHeard(p.connection_id, p.from, p.rx_time);
          }

          // Detect emoji reactions (emoji != 0 and reply_id != 0)
          if (p.emoji !== 0 && p.reply_id !== 0) {
            const targetMsgId = p.reply_id.toString();
            store.addReaction(p.connection_id, targetMsgId, p.text, p.from);

            // Subtle toast for reactions (not from our own node)
            const reactConn = store.connections[p.connection_id];
            if (reactConn && p.from !== reactConn.myNodeNum) {
              const senderNode = reactConn.meshNodes[p.from];
              const senderName = senderNode?.user.shortName ?? `!${p.from.toString(16)}`;
              toast(`${p.text} from ${senderName}`, { duration: 3000 });
            }
            break;
          }

          const msg: MeshMessage = {
            id: p.id.toString(),
            from: p.from,
            to: p.to,
            channel: p.channel,
            text: p.text,
            timestamp: p.rx_time,
            rxSnr: p.rx_snr,
            rxRssi: p.rx_rssi,
            hopStart: p.hop_start,
            hopLimit: p.hop_limit,
            ackStatus: "none",
            replyId: p.reply_id !== 0 ? p.reply_id.toString() : undefined,
          };
          store.addMessage(p.connection_id, msg);

          // Persist to cache
          const rxConn = store.connections[p.connection_id];
          if (rxConn) {
            appendCachedMessage(rxConn.transport, rxConn.transportAddress, msg).catch((e) => console.warn("Failed to cache message:", e));
          }

          // Toast for incoming messages (not from our own node)
          const msgConn = store.connections[p.connection_id];
          if (msgConn && p.from !== msgConn.myNodeNum) {
            const senderNode = msgConn.meshNodes[p.from];
            const senderName = senderNode?.user.shortName ?? `!${p.from.toString(16)}`;
            toast(p.text, {
              description: `from ${senderName}`,
              duration: 4000,
            });
          }
          break;
        }

        case "DeviceMetricsUpdate": {
          const { connection_id, node_num, rx_time, battery_level, voltage, channel_utilization, air_util_tx, uptime_seconds } = data.payload;
          if (battery_level != null && voltage != null) {
            store.updateBattery(connection_id, battery_level, voltage);
          }
          // Telemetry is "hearing" from the node — update lastHeard
          if (rx_time > 0) {
            store.updateNodeLastHeard(connection_id, node_num, rx_time);
          }
          store.addNodeMetrics(connection_id, node_num, {
            timestamp: Math.floor(Date.now() / 1000),
            batteryLevel: battery_level ?? undefined,
            voltage: voltage ?? undefined,
            channelUtilization: channel_utilization ?? undefined,
            airUtilTx: air_util_tx ?? undefined,
            uptimeSeconds: uptime_seconds ?? undefined,
          });
          break;
        }

        case "MessageSent": {
          const { connection_id: sentConnId, local_id, packet_id } = data.payload;
          // Remap the local message ID to the radio's packet ID so ACKs match
          store.remapMessageId(sentConnId, local_id, packet_id.toString());

          // Save the full message list to cache (includes the sent message with new ID)
          const sentConn = useNodeStore.getState().connections[sentConnId];
          if (sentConn) {
            saveCachedMessages(sentConn.transport, sentConn.transportAddress, sentConn.messages).catch((e) => console.warn("Failed to cache messages:", e));
          }
          break;
        }

        case "MessageAck": {
          const { connection_id, request_id, from: ackFrom, error_reason } = data.payload;
          const msgId = request_id.toString();

          // Notify admin tracker (no-op if request_id doesn't match any pending admin command)
          notifyAdminAck(request_id, error_reason);

          // Meshtastic Routing::Error codes:
          // 0 = NONE (success), 5 = MAX_RETRANSMIT, others = failure
          const MAX_RETRANSMIT = 5;

          let status: MeshMessage["ackStatus"];
          if (error_reason === 0) {
            // Success — check if direct ACK (from destination) or implicit (from relay)
            const conn = store.connections[connection_id];
            const msg = conn?.messages.find((m) => m.id === msgId);
            status = msg && msg.to === ackFrom ? "acked" : "implicit";
          } else if (error_reason === MAX_RETRANSMIT) {
            status = "max_retransmit";
          } else {
            status = "failed";
          }

          store.updateMessageAck(connection_id, msgId, status);
          break;
        }

        case "DeviceConfigReceived": {
          const { connection_id: dcConnId, config_type, config } = data.payload as {
            connection_id: string;
            config_type: string;
            config: Record<string, unknown>;
          };
          store.setDeviceConfig(dcConnId, config_type, config);
          break;
        }

        case "LoraConfigReceived": {
          const { connection_id: loraConnId, channel_num, modem_preset, region } = data.payload;
          store.setLoraConfig(loraConnId, {
            channelNum: channel_num,
            modemPreset: modem_preset,
            region,
          });
          break;
        }

        case "ConfigComplete": {
          // Config is done — connection is fully ready
          const ccConnId = data.payload.connection_id;
          store.updateConnectionStatus(ccConnId, "connected");

          // Save to connection history for quick reconnect
          const ccConn = store.connections[ccConnId];
          if (ccConn) {
            saveConnectionHistoryEntry(
              ccConn.transport,
              ccConn.transportAddress,
              ccConn.label,
              ccConn.myUser?.shortName,
            ).catch((e) => console.warn("Failed to save connection history:", e));

            // Load cached messages and nodes from IndexedDB
            (async () => {
              try {
                const { transport, transportAddress } = ccConn;

                // Load cached messages (merge with any already received during handshake)
                const cachedMsgs = await loadCachedMessages(transport, transportAddress);
                if (cachedMsgs.length > 0) {
                  const currentMsgIds = new Set(ccConn.messages.map((m) => m.id));
                  const newMsgs = cachedMsgs.filter((m) => !currentMsgIds.has(m.id));
                  if (newMsgs.length > 0) {
                    const merged = [...newMsgs, ...ccConn.messages]
                      .sort((a, b) => a.timestamp - b.timestamp);
                    const freshStore = useNodeStore.getState();
                    const freshConn = freshStore.connections[ccConnId];
                    if (freshConn) {
                      useNodeStore.setState({
                        connections: {
                          ...freshStore.connections,
                          [ccConnId]: { ...freshConn, messages: merged },
                        },
                      });
                    }
                  }
                }

                // Load cached nodes (with stale cleanup)
                const settings = await getAppSettings().catch((e) => {
                  console.warn("Failed to load app settings, using defaults:", e);
                  return { staleNodeDays: 7 };
                });
                const cachedNodes = await cleanStaleNodes(transport, transportAddress, settings.staleNodeDays);
                if (Object.keys(cachedNodes).length > 0) {
                  const freshStore = useNodeStore.getState();
                  const freshConn = freshStore.connections[ccConnId];
                  if (freshConn) {
                    // Merge: device-provided nodes take priority, cached fill in the rest
                    const mergedNodes = { ...cachedNodes, ...freshConn.meshNodes };
                    useNodeStore.setState({
                      connections: {
                        ...freshStore.connections,
                        [ccConnId]: { ...freshConn, meshNodes: mergedNodes },
                      },
                    });
                  }
                }
              } catch (e) {
                console.error("Cache load failed:", e);
              }
            })();
          }
          break;
        }

        case "UserUpdate": {
          const { connection_id, num, user } = data.payload;
          // Update the user field on the existing node
          const conn = store.connections[connection_id];
          if (conn) {
            const existing = conn.meshNodes[num];
            if (existing) {
              store.upsertMeshNode(connection_id, {
                ...existing,
                user: mapUser(user),
              });
            }
            // If it's our node, update myUser
            if (conn.myNodeNum === num) {
              store.setMyNodeInfo(connection_id, num, mapUser(user));
            }
          }
          break;
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
