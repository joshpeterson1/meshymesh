import { useState } from "react";
import {
  Radio,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  MapPin,
  Clock,
  ArrowUpDown,
  Star,
  Search,
  X,
} from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { MeshNode } from "@/stores/types";

type SortField = "lastHeard" | "name" | "hops" | "snr" | "battery";

function formatRole(role: string): string {
  // Convert SCREAMING_SNAKE_CASE to Title Case (e.g. "CLIENT_MUTE" → "Client Mute")
  return role
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function formatLastHeard(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function BattIcon({ level }: { level?: number }) {
  if (level == null)
    return <Battery size={14} className="text-zinc-600" />;
  if (level > 75)
    return <BatteryFull size={14} className="text-green-400" />;
  if (level > 25)
    return <BatteryMedium size={14} className="text-yellow-400" />;
  return <BatteryLow size={14} className="text-red-400" />;
}

function SnrBadge({ snr }: { snr: number }) {
  const color =
    snr >= 10
      ? "text-green-400"
      : snr >= 5
        ? "text-yellow-400"
        : snr >= 0
          ? "text-orange-400"
          : "text-red-400";
  return <span className={cn("text-xs font-mono", color)}>{snr.toFixed(1)}</span>;
}

const sortLabels: Record<SortField, string> = {
  lastHeard: "Last Heard",
  name: "Name",
  hops: "Hops",
  snr: "SNR",
  battery: "Battery",
};

const sortCycle: SortField[] = ["lastHeard", "name", "hops", "snr", "battery"];

function sortNodes(nodes: MeshNode[], field: SortField): MeshNode[] {
  return [...nodes].sort((a, b) => {
    switch (field) {
      case "name":
        return a.user.longName.localeCompare(b.user.longName);
      case "hops":
        return a.hopsAway - b.hopsAway;
      case "snr":
        return b.snr - a.snr;
      case "battery":
        return (b.batteryLevel ?? -1) - (a.batteryLevel ?? -1);
      case "lastHeard":
      default:
        return b.lastHeard - a.lastHeard;
    }
  });
}

export function NodesView() {
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const connections = useNodeStore((s) => s.connections);
  const connectionOrder = useNodeStore((s) => s.connectionOrder);
  const [sortField, setSortField] = useState<SortField>("lastHeard");
  const [search, setSearch] = useState("");

  // Collect local node numbers to identify "our" nodes
  const localNodeNums = new Set<number>();
  if (selectedId === null) {
    connectionOrder.forEach((cid) => {
      const c = connections[cid];
      if (c?.myNodeNum) localNodeNums.add(c.myNodeNum);
    });
  } else {
    const conn = connections[selectedId];
    if (conn?.myNodeNum) localNodeNums.add(conn.myNodeNum);
  }

  // Gather nodes
  let nodes: (MeshNode & { connectionLabel?: string })[] = [];

  if (selectedId === null) {
    // Unified view - merge and deduplicate by node num
    const nodeMap = new Map<number, MeshNode & { connectionLabel?: string }>();
    connectionOrder.forEach((cid) => {
      const c = connections[cid];
      if (!c) return;
      Object.values(c.meshNodes).forEach((n) => {
        const existing = nodeMap.get(n.num);
        if (!existing || n.lastHeard > existing.lastHeard) {
          nodeMap.set(n.num, { ...n, connectionLabel: c.label });
        }
      });
    });
    nodes = Array.from(nodeMap.values());
  } else {
    const conn = connections[selectedId];
    if (conn) {
      nodes = Object.values(conn.meshNodes);
    }
  }

  // Filter by search
  const query = search.toLowerCase().trim();
  if (query) {
    nodes = nodes.filter((n) =>
      n.user.longName.toLowerCase().includes(query) ||
      n.user.shortName.toLowerCase().includes(query) ||
      n.user.id.toLowerCase().includes(query) ||
      n.user.hwModel.toLowerCase().includes(query) ||
      n.num.toString(16).includes(query)
    );
  }

  // Sort within tiers: local node first, then favorites, then the rest
  const local = sortNodes(nodes.filter((n) => localNodeNums.has(n.num)), sortField);
  const favorites = sortNodes(nodes.filter((n) => n.isFavorite && !localNodeNums.has(n.num)), sortField);
  const rest = sortNodes(nodes.filter((n) => !n.isFavorite && !localNodeNums.has(n.num)), sortField);
  nodes = [...local, ...favorites, ...rest];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <Radio size={16} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">
            {nodes.length} Nodes
          </span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative max-w-[200px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded pl-7 pr-6 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              const idx = sortCycle.indexOf(sortField);
              setSortField(sortCycle[(idx + 1) % sortCycle.length]);
            }}
            className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            title={`Sort by: ${sortLabels[sortField]}`}
          >
            <ArrowUpDown size={14} />
            <span className="text-[10px]">{sortLabels[sortField]}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-zinc-950 z-10">
            <tr className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">Node</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-center px-4 py-2">Hops</th>
              <th className="text-center px-4 py-2">SNR</th>
              <th className="text-center px-4 py-2">Battery</th>
              <th className="text-center px-4 py-2">Position</th>
              <th className="text-right px-4 py-2">Last Heard</th>
              {selectedId === null && (
                <th className="text-right px-4 py-2">Via</th>
              )}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const isLocal = localNodeNums.has(node.num);
              return (
              <tr
                key={node.num}
                className={cn(
                  "border-t border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer",
                  isLocal && "bg-mesh-green/5",
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      isLocal
                        ? "bg-mesh-green/20 text-mesh-green ring-1 ring-mesh-green/50"
                        : "bg-zinc-800 text-zinc-300",
                    )}>
                      {node.user.shortName.slice(0, 2).toUpperCase()}
                      {node.isFavorite && !isLocal && (
                        <Star size={8} className="absolute -top-0.5 -right-0.5 text-yellow-400 fill-yellow-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-200">
                          {node.user.longName}
                        </span>
                        {isLocal && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-mesh-green/15 text-mesh-green">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {node.user.shortName} &middot; {node.user.hwModel}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      node.user.role === "ROUTER" || node.user.role === "ROUTER_CLIENT" || node.user.role === "ROUTER_LATE"
                        ? "bg-blue-400/15 text-blue-400"
                        : node.user.role === "REPEATER"
                          ? "bg-purple-400/15 text-purple-400"
                          : node.user.role === "TRACKER" || node.user.role === "TAK_TRACKER"
                            ? "bg-orange-400/15 text-orange-400"
                            : node.user.role === "CLIENT_MUTE" || node.user.role === "CLIENT_HIDDEN"
                              ? "bg-zinc-700 text-zinc-400"
                              : "bg-zinc-800 text-zinc-300",
                    )}
                  >
                    {formatRole(node.user.role)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-zinc-400">
                  {node.hopsAway === 0 ? (
                    <span className="text-mesh-green">Direct</span>
                  ) : (
                    node.hopsAway
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {isLocal ? <span className="text-xs text-zinc-600">N/A</span> : <SnrBadge snr={node.snr} />}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <BattIcon level={node.batteryLevel} />
                    <span className="text-xs text-zinc-400">
                      {node.batteryLevel != null ? `${node.batteryLevel}%` : "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {node.position ? (
                    <MapPin size={14} className="text-mesh-green mx-auto" />
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 text-xs text-zinc-400">
                    <Clock size={10} />
                    {formatLastHeard(node.lastHeard)}
                  </div>
                </td>
                {selectedId === null && (
                  <td className="px-4 py-2.5 text-right text-[10px] text-zinc-500">
                    {node.connectionLabel}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
