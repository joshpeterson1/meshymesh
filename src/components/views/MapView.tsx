import { useState, useMemo, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import { Globe, Maximize, Minimize, Maximize2 } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useNodeStore } from "@/stores/nodeStore";
import type { MeshNode, TransportType } from "@/stores/types";
import "leaflet/dist/leaflet.css";

/* ── helpers ─────────────────────────────────────────────────────── */

const TRANSPORT_COLORS: Record<TransportType | "fallback", string> = {
  serial: "#4ade80",
  wifi: "#60a5fa",
  ble: "#c084fc",
  fallback: "#a1a1aa",
};

function transportColor(t?: TransportType): string {
  return t ? (TRANSPORT_COLORS[t] ?? TRANSPORT_COLORS.fallback) : TRANSPORT_COLORS.fallback;
}

function formatLastHeard(epochSecs: number): string {
  if (!epochSecs) return "never";
  const diff = Math.floor(Date.now() / 1000) - epochSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function hasValidPosition(node: MeshNode): boolean {
  return !!(node.position && node.position.latitude !== 0 && node.position.longitude !== 0);
}

interface PositionedNode {
  node: MeshNode;
  transport: TransportType;
  connectionId: string;
}

/* ── FitBounds inner component ───────────────────────────────────── */

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();

  const handleFit = () => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  // Fit on first render if we have bounds
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: "auto" }}>
      <button
        onClick={handleFit}
        title="Fit all nodes"
        style={{
          background: "#27272a",
          border: "1px solid #3f3f46",
          borderRadius: "0.375rem",
          padding: "6px",
          cursor: "pointer",
          marginTop: 10,
          marginRight: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Maximize2 size={16} color="#f4f4f5" />
      </button>
    </div>
  );
}

/* ── MapView ─────────────────────────────────────────────────────── */

export function MapView() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const connections = useNodeStore((s) => s.connections);

  /* Compute positioned nodes, deduplicating in unified mode */
  const positionedNodes = useMemo<PositionedNode[]>(() => {
    if (selectedId) {
      const conn = connections[selectedId];
      if (!conn) return [];
      return Object.values(conn.meshNodes)
        .filter(hasValidPosition)
        .map((node) => ({ node, transport: conn.transport, connectionId: conn.id }));
    }

    // Unified mode: merge all connections, deduplicate by node.num keeping most recent lastHeard
    const best = new Map<number, PositionedNode>();
    for (const conn of Object.values(connections)) {
      for (const node of Object.values(conn.meshNodes)) {
        if (!hasValidPosition(node)) continue;
        const existing = best.get(node.num);
        if (!existing || node.lastHeard > existing.node.lastHeard) {
          best.set(node.num, { node, transport: conn.transport, connectionId: conn.id });
        }
      }
    }
    return Array.from(best.values());
  }, [selectedId, connections]);

  /* Compute hop lines: local node -> direct peers (hopsAway === 1) */
  const hopLines = useMemo(() => {
    const lines: { from: LatLngTuple; to: LatLngTuple; color: string }[] = [];
    const relevantConns = selectedId
      ? [connections[selectedId]].filter(Boolean)
      : Object.values(connections);

    for (const conn of relevantConns) {
      if (!conn.myNodeNum) continue;
      const localNode = conn.meshNodes[conn.myNodeNum];
      if (!localNode || !hasValidPosition(localNode)) continue;
      const localPos: LatLngTuple = [localNode.position!.latitude, localNode.position!.longitude];
      const color = transportColor(conn.transport);

      for (const node of Object.values(conn.meshNodes)) {
        if (node.num === conn.myNodeNum) continue;
        if (node.hopsAway !== 1) continue;
        if (!hasValidPosition(node)) continue;
        lines.push({
          from: localPos,
          to: [node.position!.latitude, node.position!.longitude],
          color,
        });
      }
    }
    return lines;
  }, [selectedId, connections]);

  /* Compute bounds */
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (positionedNodes.length === 0) return null;
    const lats = positionedNodes.map((p) => p.node.position!.latitude);
    const lngs = positionedNodes.map((p) => p.node.position!.longitude);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [positionedNodes]);

  /* Empty state */
  if (positionedNodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center">
          <Globe size={32} className="text-zinc-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-400">Mesh Map</p>
          <p className="text-xs text-zinc-600 mt-1">No nodes with GPS positions</p>
        </div>
      </div>
    );
  }

  const containerStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 40 }
    : { height: "100%", width: "100%" };

  return (
    <div style={containerStyle} className="relative">
      {/* Fullscreen toggle */}
      <button
        onClick={() => setIsFullscreen((v) => !v)}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          background: "#27272a",
          border: "1px solid #3f3f46",
          borderRadius: "0.375rem",
          padding: "6px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isFullscreen ? (
          <Minimize size={16} color="#f4f4f5" />
        ) : (
          <Maximize size={16} color="#f4f4f5" />
        )}
      </button>

      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: "100%", width: "100%" }}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds bounds={bounds} />

        {/* Hop lines */}
        {hopLines.map((line, i) => (
          <Polyline
            key={`hop-${i}`}
            positions={[line.from, line.to]}
            pathOptions={{
              color: line.color,
              opacity: 0.4,
              weight: 2,
              dashArray: "5,10",
            }}
          />
        ))}

        {/* Node markers */}
        {positionedNodes.map((pn) => (
          <CircleMarker
            key={pn.node.num}
            center={[pn.node.position!.latitude, pn.node.position!.longitude]}
            radius={8}
            pathOptions={{
              color: transportColor(pn.transport),
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Popup>
              <div
                style={{
                  fontFamily: "inherit",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  minWidth: 140,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  [{pn.node.user.shortName}] {pn.node.user.longName}
                </div>
                <div style={{ color: "#a1a1aa" }}>HW: {pn.node.user.hwModel}</div>
                <div style={{ color: "#a1a1aa" }}>
                  SNR: {pn.node.snr.toFixed(1)} dB
                  {pn.node.batteryLevel != null && ` | Battery: ${pn.node.batteryLevel}%`}
                </div>
                <div style={{ color: "#a1a1aa" }}>
                  Last heard: {formatLastHeard(pn.node.lastHeard)}
                </div>
                <div style={{ color: "#a1a1aa" }}>Hops: {pn.node.hopsAway}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
