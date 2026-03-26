import { useState, useRef, useEffect, useMemo } from "react";
import { Star, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { AddConnectionDialog } from "@/components/dialogs/AddConnectionDialog";
import { toast } from "sonner";
import {
  disconnectNode,
  connectSerial,
  connectTcp,
  getConnectionHistory,
  forgetConnectionHistoryEntry,
  type ConnectionHistoryEntry,
} from "@/lib/tauri";
import type { TransportType, ConnectionStatus, NodeConnection } from "@/stores/types";

const transportColor: Record<TransportType, string> = {
  serial: "bg-green-400",
  wifi: "bg-blue-400",
  ble: "bg-purple-400",
};

const statusDot: Record<ConnectionStatus, string> = {
  connected: "bg-green-400",
  connecting: "bg-yellow-400 animate-pulse",
  reconnecting: "bg-orange-400 animate-pulse",
  disconnected: "bg-zinc-500",
  error: "bg-red-400",
};

function ConnectionButton({
  conn,
  isSelected,
  onSelect,
  onContextMenu,
}: {
  conn: NodeConnection;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const initials = conn.myUser?.shortName?.slice(0, 2) ?? conn.label.slice(0, 2);
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "relative w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold transition-all duration-200 shrink-0",
        isSelected
          ? "bg-zinc-700 text-zinc-100 rounded-2xl"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 hover:rounded-xl",
      )}
      title={`${conn.label} (${conn.transport.toUpperCase()} - ${conn.transportAddress})`}
    >
      {initials.toUpperCase()}
      <div
        className={cn(
          "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900",
          transportColor[conn.transport],
        )}
      />
      <div
        className={cn(
          "absolute top-0 right-0 w-2 h-2 rounded-full border-[1.5px] border-zinc-900",
          statusDot[conn.status],
        )}
      />
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1 h-5 bg-white rounded-r-full" />
      )}
    </button>
  );
}

export function NodeRail() {
  const connections = useNodeStore((s) => s.connections);
  const connectionOrder = useNodeStore((s) => s.connectionOrder);
  const removeConnection = useNodeStore((s) => s.removeConnection);
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const selectConnection = useUIStore((s) => s.selectConnection);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ connId: string; x: number; y: number } | null>(null);
  const [ghostMenu, setGhostMenu] = useState<{ entry: ConnectionHistoryEntry; x: number; y: number } | null>(null);
  const [collapsedSlots, setCollapsedSlots] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<ConnectionHistoryEntry[]>([]);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load history on mount and when connections change
  useEffect(() => {
    getConnectionHistory().then(setHistory).catch((e) => console.warn("Failed to load connection history:", e));
  }, [connectionOrder.length]);

  // Ghost entries: history items not currently connected
  const activeAddresses = useMemo(() => {
    const set = new Set<string>();
    connectionOrder.forEach((cid) => {
      const c = connections[cid];
      if (c) set.add(`${c.transport}:${c.transportAddress}`);
    });
    return set;
  }, [connections, connectionOrder]);

  const ghostEntries = useMemo(
    () => history.filter((h) => !activeAddresses.has(`${h.transport}:${h.address}`)),
    [history, activeAddresses],
  );

  const handleReconnect = async (entry: ConnectionHistoryEntry) => {
    const key = `${entry.transport}:${entry.address}`;
    setReconnecting(key);
    try {
      const label = entry.short_name ?? entry.label;
      if (entry.transport === "serial") {
        const connId = await connectSerial(entry.address, label);
        addSkeletonConnection(connId, label, "serial", entry.address);
      } else {
        const connId = await connectTcp(entry.address, label);
        addSkeletonConnection(connId, label, "wifi", entry.address);
      }
    } catch (e) {
      toast.error("Reconnect failed", { description: String(e) });
    }
    setReconnecting(null);
  };

  const handleForgetGhost = async (entry: ConnectionHistoryEntry) => {
    setGhostMenu(null);
    await forgetConnectionHistoryEntry(entry.transport, entry.address).catch((e) => {
      toast.error("Failed to forget history entry", { description: String(e) });
    });
    setHistory((h) => h.filter((e) => !(e.transport === entry.transport && e.address === entry.address)));
  };

  const addSkeletonConnection = useNodeStore((s) => s.addSkeletonConnection);

  // Group connections by channel_num (frequency slot)
  const slotGroups = useMemo(() => {
    const groups = new Map<number, string[]>();
    connectionOrder.forEach((connId) => {
      const conn = connections[connId];
      if (!conn) return;
      const slot = conn.loraConfig?.channelNum ?? 0;
      if (!groups.has(slot)) groups.set(slot, []);
      groups.get(slot)!.push(connId);
    });
    // Sort slot groups: default (0) first, then ascending
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [connections, connectionOrder]);

  const toggleSlot = (slot: number) => {
    setCollapsedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const slotLabel = (slot: number) => slot === 0 ? "Default" : `Freq ${slot}`;

  // Close context menus on outside click
  useEffect(() => {
    if (!contextMenu && !ghostMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setGhostMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu, ghostMenu]);

  const handleDisconnect = async (connId: string) => {
    setContextMenu(null);
    try {
      await disconnectNode(connId);
    } catch (e) {
      // Disconnect may fail if backend already cleaned up — that's fine
    }
    // If we were viewing this connection, switch to All Nodes
    if (selectedId === connId) {
      selectConnection(null);
    }
    removeConnection(connId);
  };

  return (
    <div className="flex flex-col items-center h-full pt-4 pb-4 gap-2">
      {/* All Nodes */}
      <button
        onClick={() => selectConnection(null)}
        className={cn(
          "relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
          selectedId === null
            ? "bg-mesh-green text-zinc-900 rounded-2xl"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 hover:rounded-xl",
        )}
        title="All Nodes"
      >
        <Star size={16} />
        {selectedId === null && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1 h-5 bg-white rounded-r-full" />
        )}
      </button>

      {/* Separator */}
      <div className="w-5 h-px bg-zinc-700" />

      {/* Node icons grouped by frequency slot */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 w-full scrollbar-none py-1">
        {slotGroups.map(([slot, connIds]) => {
          const isCollapsed = collapsedSlots.has(slot);
          const showFolder = slotGroups.length > 1;

          return (
            <div key={slot} className="flex flex-col items-center gap-1 w-full">
              {showFolder && (
                <button
                  onClick={() => toggleSlot(slot)}
                  className="flex items-center justify-center gap-0.5 w-full py-1 text-[9px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={slotLabel(slot)}
                >
                  {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  <span className="truncate">{slotLabel(slot)}</span>
                </button>
              )}
              {!isCollapsed && connIds.map((connId) => {
                const conn = connections[connId];
                if (!conn) return null;
                return (
                  <ConnectionButton
                    key={connId}
                    conn={conn}
                    isSelected={selectedId === connId}
                    onSelect={() => selectConnection(connId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ connId, x: e.clientX, y: e.clientY });
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Add button + ghost reconnect icons */}
      <div className="w-5 h-px bg-zinc-700" />
      <button
        onClick={() => setDialogOpen(true)}
        className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-mesh-green flex items-center justify-center transition-all duration-200 hover:rounded-xl shrink-0"
        title="Add Connection"
      >
        <Plus size={16} />
      </button>
      {ghostEntries.map((entry) => {
        const key = `${entry.transport}:${entry.address}`;
        const initials = entry.short_name?.slice(0, 2) ?? entry.address.slice(0, 2);
        const isReconnecting = reconnecting === key;
        return (
          <button
            key={key}
            onClick={() => handleReconnect(entry)}
            onContextMenu={(e) => {
              e.preventDefault();
              setGhostMenu({ entry, x: e.clientX, y: e.clientY });
            }}
            disabled={isReconnecting}
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold transition-all duration-200 shrink-0 border border-dashed",
              isReconnecting
                ? "border-zinc-600 text-zinc-500 animate-pulse"
                : "border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 hover:rounded-xl",
            )}
            title={`Reconnect ${entry.short_name ?? entry.label} (${entry.address})`}
          >
            {initials.toUpperCase()}
          </button>
        );
      })}

      <AddConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      {/* Ghost right-click context menu */}
      {ghostMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: ghostMenu.x, top: ghostMenu.y }}
        >
          <button
            onClick={() => handleForgetGhost(ghostMenu.entry)}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          >
            Forget
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (() => {
        const conn = connections[contextMenu.connId];
        const isAlive = conn?.status === "connected" || conn?.status === "connecting" || conn?.status === "reconnecting";
        return (
          <div
            ref={menuRef}
            className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleDisconnect(contextMenu.connId)}
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
            >
              {isAlive ? "Disconnect" : "Remove"}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
