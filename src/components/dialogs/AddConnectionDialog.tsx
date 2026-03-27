import { useState, useEffect } from "react";
import { Usb, Wifi, Bluetooth, Loader2, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNodeStore } from "@/stores/nodeStore";
import {
  listSerialPorts,
  connectSerial,
  connectTcp,
  scanBleDevices,
  connectBle,
  getConnectionHistory,
  type ConnectionHistoryEntry,
  type BleDeviceInfo,
} from "@/lib/tauri";

function formatTimeAgo(epochSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RssiBars({ rssi }: { rssi: number | null }) {
  const bars =
    rssi != null && rssi > -60 ? 3 : rssi != null && rssi > -80 ? 2 : 1;
  return (
    <div className="flex items-end gap-px" title={rssi != null ? `${rssi} dBm` : "Unknown"}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-sm",
            i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3.5",
            i <= bars ? "bg-mesh-green" : "bg-zinc-700",
          )}
        />
      ))}
    </div>
  );
}

interface AddConnectionDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "serial" | "wifi" | "ble";

export function AddConnectionDialog({
  open,
  onClose,
}: AddConnectionDialogProps) {
  const [tab, setTab] = useState<Tab>("serial");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serial state
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [serialLabel, setSerialLabel] = useState("");
  const [scanningPorts, setScanningPorts] = useState(false);

  // WiFi state
  const [wifiAddress, setWifiAddress] = useState("");
  const [wifiLabel, setWifiLabel] = useState("");

  // BLE state
  const [bleDevices, setBleDevices] = useState<BleDeviceInfo[]>([]);
  const [selectedBleDevice, setSelectedBleDevice] = useState<string>("");
  const [bleLabel, setBleLabel] = useState("");
  const [scanningBle, setScanningBle] = useState(false);

  // History
  const [history, setHistory] = useState<ConnectionHistoryEntry[]>([]);

  const addSkeletonConnection = useNodeStore(
    (s) => s.addSkeletonConnection,
  );

  // Scan serial ports and load history when dialog opens
  useEffect(() => {
    if (open) {
      getConnectionHistory().then(setHistory).catch((e) => console.warn("Failed to load connection history:", e));
      if (tab === "serial") scanPorts();
      if (tab === "ble") scanBle();
    }
  }, [open, tab]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setError(null);
      setLoading(false);
      setSelectedPort("");
      setSerialLabel("");
      setWifiAddress("");
      setWifiLabel("");
      setBleDevices([]);
      setSelectedBleDevice("");
      setBleLabel("");
    }
  }, [open]);

  const serialHistory = history.filter((h) => h.transport === "serial");
  const wifiHistory = history.filter((h) => h.transport === "wifi");
  const bleHistory = history.filter((h) => h.transport === "ble");

  function getPortAnnotation(port: string): string | null {
    const entry = serialHistory.find((h) => h.address === port);
    if (!entry) return null;
    const name = entry.short_name ?? entry.label;
    return `${name} — ${formatTimeAgo(entry.last_connected)}`;
  }

  async function scanPorts() {
    setScanningPorts(true);
    try {
      const found = await listSerialPorts();
      // Sort: recently used ports first
      const recentAddrs = serialHistory.map((h) => h.address);
      found.sort((a, b) => {
        const aRecent = recentAddrs.indexOf(a);
        const bRecent = recentAddrs.indexOf(b);
        if (aRecent >= 0 && bRecent < 0) return -1;
        if (bRecent >= 0 && aRecent < 0) return 1;
        if (aRecent >= 0 && bRecent >= 0) return aRecent - bRecent;
        return 0;
      });
      setPorts(found);
      if (found.length > 0 && !selectedPort) {
        setSelectedPort(found[0]);
      }
    } catch (e) {
      setPorts([]);
    }
    setScanningPorts(false);
  }

  async function handleConnectSerial() {
    if (!selectedPort) return;
    setLoading(true);
    setError(null);
    const label = serialLabel || selectedPort;
    try {
      const connId = await connectSerial(selectedPort, label);
      // Update the auto-created skeleton with real label/transport info
      addSkeletonConnection(connId, label, "serial", selectedPort);
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function handleConnectWifi() {
    if (!wifiAddress) return;
    setLoading(true);
    setError(null);
    const label = wifiLabel || wifiAddress;
    try {
      const connId = await connectTcp(wifiAddress, label);
      // Update the auto-created skeleton with real label/transport info
      addSkeletonConnection(connId, label, "wifi", wifiAddress);
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function scanBle() {
    setScanningBle(true);
    try {
      const found = await scanBleDevices();
      setBleDevices(found);
      if (found.length > 0 && !selectedBleDevice) {
        setSelectedBleDevice(found[0].address);
      }
    } catch (e) {
      setBleDevices([]);
    }
    setScanningBle(false);
  }

  async function handleConnectBle() {
    if (!selectedBleDevice) return;
    setLoading(true);
    setError(null);
    const device = bleDevices.find((d) => d.address === selectedBleDevice);
    const label = bleLabel || device?.name || selectedBleDevice;
    try {
      const connId = await connectBle(selectedBleDevice, label);
      addSkeletonConnection(connId, label, "ble", selectedBleDevice);
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl w-[420px] shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-100">
            Add Connection
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Connect to a Meshtastic node
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setTab("serial")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
              tab === "serial"
                ? "text-zinc-100 border-b-2 border-mesh-green"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Usb size={14} />
            Serial
          </button>
          <button
            onClick={() => setTab("wifi")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
              tab === "wifi"
                ? "text-zinc-100 border-b-2 border-mesh-green"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Wifi size={14} />
            WiFi
          </button>
          <button
            onClick={() => setTab("ble")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
              tab === "ble"
                ? "text-zinc-100 border-b-2 border-mesh-green"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Bluetooth size={14} />
            BLE
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {tab === "serial" && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Serial Port
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                  >
                    {ports.length === 0 && (
                      <option value="">No ports found</option>
                    )}
                    {ports.map((p) => {
                      const annotation = getPortAnnotation(p);
                      return (
                        <option key={p} value={p}>
                          {p}{annotation ? ` — ${annotation}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={scanPorts}
                    disabled={scanningPorts}
                    className="px-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Refresh ports"
                  >
                    <RefreshCw
                      size={14}
                      className={scanningPorts ? "animate-spin" : ""}
                    />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={serialLabel}
                  onChange={(e) => setSerialLabel(e.target.value)}
                  placeholder={selectedPort || "My Node"}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
              </div>
            </>
          )}

          {tab === "wifi" && (
            <>
              {wifiHistory.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Recent
                  </label>
                  <div className="space-y-1">
                    {wifiHistory.map((h) => (
                      <button
                        key={h.address}
                        onClick={() => {
                          setWifiAddress(h.address);
                          setWifiLabel(h.label);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                          wifiAddress === h.address
                            ? "bg-zinc-700 text-zinc-100"
                            : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Wifi size={12} />
                          <span>{h.address}</span>
                          {h.short_name && (
                            <span className="text-zinc-500">— {h.short_name}</span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-zinc-600">
                          <Clock size={10} />
                          {formatTimeAgo(h.last_connected)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  IP Address
                </label>
                <input
                  type="text"
                  value={wifiAddress}
                  onChange={(e) => setWifiAddress(e.target.value)}
                  placeholder="192.168.1.100"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
                <p className="text-[10px] text-zinc-600 mt-1">
                  Port 4403 is used by default if not specified
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={wifiLabel}
                  onChange={(e) => setWifiLabel(e.target.value)}
                  placeholder={wifiAddress || "My Node"}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
              </div>
            </>
          )}

          {tab === "ble" && (
            <>
              {bleHistory.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Recent
                  </label>
                  <div className="space-y-1">
                    {bleHistory.map((h) => (
                      <button
                        key={h.address}
                        onClick={() => {
                          setSelectedBleDevice(h.address);
                          setBleLabel(h.label);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                          selectedBleDevice === h.address
                            ? "bg-zinc-700 text-zinc-100"
                            : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Bluetooth size={12} />
                          <span>{h.address}</span>
                          {h.short_name && (
                            <span className="text-zinc-500">— {h.short_name}</span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-zinc-600">
                          <Clock size={10} />
                          {formatTimeAgo(h.last_connected)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  BLE Device
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedBleDevice}
                    onChange={(e) => setSelectedBleDevice(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                  >
                    {bleDevices.length === 0 && (
                      <option value="">No devices found</option>
                    )}
                    {bleDevices.map((d) => (
                      <option key={d.address} value={d.address}>
                        {d.name || d.address}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={scanBle}
                    disabled={scanningBle}
                    className="px-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Scan for devices"
                  >
                    <RefreshCw
                      size={14}
                      className={scanningBle ? "animate-spin" : ""}
                    />
                  </button>
                </div>
              </div>
              {bleDevices.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Discovered Devices
                  </label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {bleDevices.map((d) => (
                      <button
                        key={d.address}
                        onClick={() => setSelectedBleDevice(d.address)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                          selectedBleDevice === d.address
                            ? "bg-zinc-700 text-zinc-100"
                            : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Bluetooth size={12} />
                          <span>{d.name || "Unknown"}</span>
                          <span className="text-zinc-600 font-mono text-[10px]">
                            {d.address}
                          </span>
                        </div>
                        <RssiBars rssi={d.rssi} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={bleLabel}
                  onChange={(e) => setBleLabel(e.target.value)}
                  placeholder={
                    bleDevices.find((d) => d.address === selectedBleDevice)
                      ?.name || "My Node"
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p className="text-xs">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={
              tab === "serial"
                ? handleConnectSerial
                : tab === "wifi"
                  ? handleConnectWifi
                  : handleConnectBle
            }
            disabled={
              loading ||
              (tab === "serial" && !selectedPort) ||
              (tab === "wifi" && !wifiAddress) ||
              (tab === "ble" && !selectedBleDevice)
            }
            className="px-4 py-2 text-sm bg-mesh-green text-zinc-900 font-medium rounded-lg hover:bg-mesh-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
