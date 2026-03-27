import { create } from "zustand";
import type {
  NodeConnection,
  MeshNode,
  MeshMessage,
  MeshChannel,
  MeshUser,
  ConnectionStatus,
  TransportType,
  LoraConfig,
  DeviceMetricsEntry,
} from "./types";
interface NodeStoreState {
  connections: Record<string, NodeConnection>;
  connectionOrder: string[];

  addConnection: (conn: NodeConnection) => void;
  addSkeletonConnection: (
    id: string,
    label: string,
    transport: TransportType,
    address: string,
  ) => void;
  removeConnection: (id: string) => void;
  reorderConnections: (ids: string[]) => void;
  updateConnectionStatus: (
    id: string,
    status: ConnectionStatus,
    error?: string,
  ) => void;
  setMyNodeInfo: (connId: string, nodeNum: number, user: MeshUser) => void;
  upsertMeshNode: (connId: string, node: MeshNode) => void;
  removeMeshNode: (connId: string, nodeNum: number) => void;
  addMessage: (connId: string, msg: MeshMessage) => void;
  updateMessageAck: (
    connId: string,
    msgId: string,
    status: MeshMessage["ackStatus"],
  ) => void;
  remapMessageId: (connId: string, localId: string, packetId: string) => void;
  setChannels: (connId: string, channels: MeshChannel[]) => void;
  setDeviceConfig: (connId: string, configType: string, config: Record<string, unknown>) => void;
  setLoraConfig: (connId: string, config: LoraConfig) => void;
  updateBattery: (connId: string, level: number, voltage: number) => void;
  addNodeMetrics: (connId: string, nodeNum: number, entry: DeviceMetricsEntry) => void;
  updateNodeLastHeard: (connId: string, nodeNum: number, lastHeard: number) => void;
  addReaction: (connId: string, targetMsgId: string, emoji: string, fromNode: number) => void;
}

export const useNodeStore = create<NodeStoreState>((set) => ({
  connections: {},
  connectionOrder: [],

  addConnection: (conn) =>
    set((state) => ({
      connections: { ...state.connections, [conn.id]: conn },
      connectionOrder: [...state.connectionOrder, conn.id],
    })),

  addSkeletonConnection: (id, label, transport, address) =>
    set((state) => {
      const existing = state.connections[id];
      const conn: NodeConnection = {
        ...(existing ?? {
          id,
          status: "connecting" as ConnectionStatus,
          channels: [],
          meshNodes: {},
          messages: [],
          deviceConfigs: {},
          lastActivity: Math.floor(Date.now() / 1000),
        }),
        id,
        label,
        transport,
        transportAddress: address,
      };
      return {
        connections: { ...state.connections, [id]: conn },
        connectionOrder: state.connectionOrder.includes(id)
          ? state.connectionOrder
          : [...state.connectionOrder, id],
      };
    }),

  removeConnection: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.connections;
      return {
        connections: rest,
        connectionOrder: state.connectionOrder.filter((cid) => cid !== id),
      };
    }),

  reorderConnections: (ids) => set({ connectionOrder: ids }),

  updateConnectionStatus: (id, status, error) =>
    set((state) => {
      const conn = state.connections[id];
      if (!conn) {
        // Auto-create skeleton for connections from events that arrive before the dialog finishes
        const skeleton: NodeConnection = {
          id,
          label: "Connecting...",
          transport: "serial",
          transportAddress: "",
          status,
          errorMessage: error,
          channels: [],
          meshNodes: {},
          messages: [],
          deviceConfigs: {},
          lastActivity: Math.floor(Date.now() / 1000),
        };
        return {
          connections: { ...state.connections, [id]: skeleton },
          connectionOrder: state.connectionOrder.includes(id)
            ? state.connectionOrder
            : [...state.connectionOrder, id],
        };
      }
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, status, errorMessage: error },
        },
      };
    }),

  setMyNodeInfo: (connId, nodeNum, user) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, myNodeNum: nodeNum, myUser: user },
        },
      };
    }),

  upsertMeshNode: (connId, node) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            meshNodes: { ...conn.meshNodes, [node.num]: node },
            lastActivity: Math.floor(Date.now() / 1000),
          },
        },
      };
    }),

  removeMeshNode: (connId, nodeNum) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      const { [nodeNum]: _, ...rest } = conn.meshNodes;
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, meshNodes: rest },
        },
      };
    }),

  addMessage: (connId, msg) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      // Deduplicate by message ID
      if (conn.messages.some((m) => m.id === msg.id)) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            messages: [...conn.messages, msg],
            lastActivity: msg.timestamp,
          },
        },
      };
    }),

  updateMessageAck: (connId, msgId, status) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            messages: conn.messages.map((m) =>
              m.id === msgId ? { ...m, ackStatus: status } : m,
            ),
          },
        },
      };
    }),

  remapMessageId: (connId, localId, packetId) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            messages: conn.messages.map((m) =>
              m.id === localId ? { ...m, id: packetId } : m,
            ),
          },
        },
      };
    }),

  setChannels: (connId, channels) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, channels },
        },
      };
    }),

  setDeviceConfig: (connId, configType, config) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            deviceConfigs: { ...conn.deviceConfigs, [configType]: config },
          },
        },
      };
    }),

  setLoraConfig: (connId, config) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, loraConfig: config },
        },
      };
    }),

  updateBattery: (connId, level, voltage) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, batteryLevel: level, voltage },
        },
      };
    }),

  addNodeMetrics: (connId, nodeNum, entry) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      const node = conn.meshNodes[nodeNum];
      if (!node) return state;
      const log = node.metricsLog ?? [];
      // Cap at 100 entries to prevent unbounded growth
      const updated = [...log, entry].slice(-100);
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            meshNodes: {
              ...conn.meshNodes,
              [nodeNum]: {
                ...node,
                batteryLevel: entry.batteryLevel ?? node.batteryLevel,
                voltage: entry.voltage ?? node.voltage,
                uptimeSeconds: entry.uptimeSeconds ?? node.uptimeSeconds,
                channelUtilization: entry.channelUtilization ?? node.channelUtilization,
                airUtilTx: entry.airUtilTx ?? node.airUtilTx,
                metricsLog: updated,
              },
            },
          },
        },
      };
    }),

  updateNodeLastHeard: (connId, nodeNum, lastHeard) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      const node = conn.meshNodes[nodeNum];
      if (!node || node.lastHeard >= lastHeard) return state;
      return {
        connections: {
          ...state.connections,
          [connId]: {
            ...conn,
            meshNodes: {
              ...conn.meshNodes,
              [nodeNum]: { ...node, lastHeard },
            },
          },
        },
      };
    }),

  addReaction: (connId, targetMsgId, emoji, fromNode) =>
    set((state) => {
      const conn = state.connections[connId];
      if (!conn) return state;
      const msgIdx = conn.messages.findIndex((m) => m.id === targetMsgId);
      if (msgIdx === -1) return state;
      const msg = conn.messages[msgIdx];
      const existing = msg.reactions ?? [];
      // Deduplicate by (emoji + from) pair
      if (existing.some((r) => r.emoji === emoji && r.from === fromNode)) return state;
      const updated = [...conn.messages];
      updated[msgIdx] = { ...msg, reactions: [...existing, { emoji, from: fromNode }] };
      return {
        connections: {
          ...state.connections,
          [connId]: { ...conn, messages: updated },
        },
      };
    }),
}));
