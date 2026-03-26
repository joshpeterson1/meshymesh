import {
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  Wifi,
  Bluetooth,
  Usb,
  Radio,
  Clock,
} from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import type { TransportType } from "@/stores/types";

const transportIcon: Record<TransportType, typeof Wifi> = {
  serial: Usb,
  wifi: Wifi,
  ble: Bluetooth,
};

function BatteryIcon({ level }: { level?: number }) {
  if (level == null) return <Battery size={14} className="text-zinc-500" />;
  if (level > 75) return <BatteryFull size={14} className="text-green-400" />;
  if (level > 25)
    return <BatteryMedium size={14} className="text-yellow-400" />;
  return <BatteryLow size={14} className="text-red-400" />;
}

function formatLastHeard(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function StatusBar() {
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const connections = useNodeStore((s) => s.connections);
  const connectionOrder = useNodeStore((s) => s.connectionOrder);

  if (selectedId === null) {
    const connected = connectionOrder.filter(
      (id) => connections[id]?.status === "connected",
    ).length;
    const total = connectionOrder.length;
    const totalPeers = connectionOrder.reduce((sum, id) => {
      const c = connections[id];
      return sum + (c ? Object.keys(c.meshNodes).length : 0);
    }, 0);

    return (
      <div className="h-[34px] bg-zinc-900 border-t border-zinc-800 flex items-center px-5 text-[11px] text-zinc-400 gap-5">
        <span className="flex items-center gap-1.5">
          <Radio size={12} />
          {connected}/{total} connected
        </span>
        <span className="flex items-center gap-1.5">
          <Radio size={12} />
          {totalPeers} total peers
        </span>
        <span className="flex-1" />
        <span className="text-zinc-600">MeshyMesh v0.1.0</span>
      </div>
    );
  }

  const conn = connections[selectedId];
  if (!conn) return null;

  const TIcon = transportIcon[conn.transport];
  const peerCount = Object.keys(conn.meshNodes).length;

  return (
    <div className="h-[34px] bg-zinc-900 border-t border-zinc-800 flex items-center px-5 text-[11px] text-zinc-400 gap-5">
      <span className="flex items-center gap-1.5">
        <div
          className={`w-1.5 h-1.5 rounded-full ${conn.status === "connected" ? "bg-green-400" : conn.status === "reconnecting" ? "bg-orange-400 animate-pulse" : conn.status === "error" ? "bg-red-400" : "bg-zinc-500"}`}
        />
        {conn.label}
      </span>
      <span className="flex items-center gap-1.5">
        <TIcon size={12} />
        {conn.transportAddress}
      </span>
      <span className="flex items-center gap-1.5">
        <Radio size={12} />
        {peerCount} peers
      </span>
      <span className="flex items-center gap-1.5">
        <BatteryIcon level={conn.batteryLevel} />
        {conn.batteryLevel == null
          ? "N/A"
          : conn.batteryLevel > 100
            ? "Powered"
            : `${conn.batteryLevel}%`}
      </span>
      <span className="flex items-center gap-1.5" title="Last activity from this connection">
        <Clock size={12} />
        {formatLastHeard(conn.lastActivity)}
      </span>
      <span className="flex-1" />
      <span className="text-zinc-600">MeshyMesh v0.1.0</span>
    </div>
  );
}
