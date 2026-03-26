import {
  Settings,
  Wifi,
  Bluetooth,
  Usb,
  Cpu,
  Cable,
} from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { RadioConfigEditor } from "@/components/config/RadioConfigEditor";
import type { TransportType } from "@/stores/types";

const transportIcon: Record<TransportType, typeof Wifi> = {
  serial: Usb,
  wifi: Wifi,
  ble: Bluetooth,
};

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Settings;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-zinc-500" />
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        {title}
      </h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-zinc-800/50">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-200 font-mono">{value}</span>
    </div>
  );
}

function ConnectionsDashboard() {
  const connections = useNodeStore((s) => s.connections);
  const connectionOrder = useNodeStore((s) => s.connectionOrder);

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Cable size={18} className="text-zinc-400" />
        <h2 className="text-lg font-semibold text-zinc-100">Connections</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {connectionOrder.map((cid) => {
          const conn = connections[cid];
          if (!conn) return null;
          const TIcon = transportIcon[conn.transport];
          const peerCount = Object.keys(conn.meshNodes).length;

          return (
            <div
              key={cid}
              className="bg-zinc-900 rounded-lg border border-zinc-800 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      conn.status === "connected"
                        ? "bg-green-400"
                        : conn.status === "error"
                          ? "bg-red-400"
                          : "bg-zinc-500",
                    )}
                  />
                  <span className="font-medium text-sm text-zinc-100">
                    {conn.label}
                  </span>
                </div>
                <TIcon size={14} className="text-zinc-500" />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Transport</span>
                  <span className="text-zinc-300">
                    {conn.transport.toUpperCase()} &middot;{" "}
                    {conn.transportAddress}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Node ID</span>
                  <span className="text-zinc-300 font-mono">
                    {conn.myUser?.id ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Peers</span>
                  <span className="text-zinc-300">{peerCount}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Battery</span>
                  <span className="text-zinc-300">
                    {conn.batteryLevel != null
                      ? `${conn.batteryLevel}%`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Channels</span>
                  <span className="text-zinc-300">
                    {conn.channels
                      .filter((c) => c.role !== "disabled")
                      .map((c) => c.name)
                      .join(", ")}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsView() {
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const connections = useNodeStore((s) => s.connections);

  // Unified view shows connections dashboard
  if (selectedId === null) {
    return <ConnectionsDashboard />;
  }

  const conn = connections[selectedId];
  if (!conn) return null;

  const TIcon = transportIcon[conn.transport];

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={18} className="text-zinc-400" />
        <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
      </div>

      {/* Connection Info */}
      <div>
        <SectionHeader icon={TIcon} title="Connection" />
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2">
          <InfoRow label="Transport" value={conn.transport.toUpperCase()} />
          <InfoRow label="Address" value={conn.transportAddress} />
          <InfoRow label="Status" value={conn.status} />
          <InfoRow label="Label" value={conn.label} />
        </div>
      </div>

      {/* Node Info */}
      <div>
        <SectionHeader icon={Cpu} title="Node Information" />
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2">
          <InfoRow label="Node ID" value={conn.myUser?.id ?? "—"} />
          <InfoRow label="Long Name" value={conn.myUser?.longName ?? "—"} />
          <InfoRow label="Short Name" value={conn.myUser?.shortName ?? "—"} />
          <InfoRow label="Hardware" value={conn.myUser?.hwModel ?? "—"} />
          <InfoRow label="Role" value={conn.myUser?.role ?? "—"} />
        </div>
      </div>

      {/* Radio Config Editor (LoRa + Channels + Security) */}
      <RadioConfigEditor
        connectionId={selectedId}
        deviceConfigs={conn.deviceConfigs}
        channels={conn.channels}
        isConnected={conn.status === "connected"}
        shortName={conn.myUser?.shortName}
      />
    </div>
  );
}
