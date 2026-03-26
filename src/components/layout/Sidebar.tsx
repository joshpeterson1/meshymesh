import {
  MessageSquare,
  Radio,
  Map,
  Settings,
  Cable,
  Wifi,
  Bluetooth,
  Usb,
} from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { SidebarView, TransportType } from "@/stores/types";

const transportIcon: Record<TransportType, typeof Wifi> = {
  serial: Usb,
  wifi: Wifi,
  ble: Bluetooth,
};

const transportLabel: Record<TransportType, string> = {
  serial: "Serial",
  wifi: "WiFi",
  ble: "Bluetooth",
};

const transportBadgeColor: Record<TransportType, string> = {
  serial: "bg-green-400/15 text-green-400",
  wifi: "bg-blue-400/15 text-blue-400",
  ble: "bg-purple-400/15 text-purple-400",
};

interface NavItem {
  id: SidebarView;
  label: string;
  icon: typeof MessageSquare;
}

const nodeNavItems: NavItem[] = [
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  { id: "nodes", label: "Nodes", icon: Radio },
  { id: "map", label: "Mesh Map", icon: Map },
  { id: "settings", label: "Settings", icon: Settings },
];

const unifiedNavItems: NavItem[] = [
  { id: "conversations", label: "All Messages", icon: MessageSquare },
  { id: "nodes", label: "All Nodes", icon: Radio },
  { id: "map", label: "Combined Map", icon: Map },
  { id: "settings", label: "Connections", icon: Cable },
];

export function Sidebar() {
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const connections = useNodeStore((s) => s.connections);

  const conn = selectedId ? connections[selectedId] : null;
  const isUnified = selectedId === null;
  const navItems = isUnified ? unifiedNavItems : nodeNavItems;

  const TransportIcon = conn ? transportIcon[conn.transport] : null;

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 border-r border-zinc-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        {conn ? (
          <div>
            <div className="font-semibold text-sm text-zinc-100 truncate">
              {conn.myUser?.shortName || conn.label}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                  transportBadgeColor[conn.transport],
                )}
              >
                {TransportIcon && <TransportIcon size={10} />}
                {transportLabel[conn.transport]}
              </span>
              <span className="text-[10px] text-zinc-500">
                {conn.transportAddress}
              </span>
            </div>
            {conn.loraConfig != null && (
              <div className="text-[10px] text-zinc-500 mt-1">
                Slot {conn.loraConfig.channelNum}{conn.loraConfig.channelNum === 0 ? " (Default)" : ""}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="font-semibold text-sm text-zinc-100">
              All Nodes
            </div>
            <div className="text-[10px] text-zinc-500 mt-1.5">
              Unified view across{" "}
              {Object.keys(connections).length} connections
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
              )}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Node stats (when a specific node is selected) */}
      {conn && (
        <div className="px-4 py-2.5 border-t border-zinc-800 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-500">Peers</span>
            <span className="text-zinc-300">
              {Object.keys(conn.meshNodes).length}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-500">Messages</span>
            <span className="text-zinc-300">{conn.messages.length}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-500">Channels</span>
            <span className="text-zinc-300">
              {conn.channels.filter((c) => c.role !== "disabled").length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
