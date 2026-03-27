import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { Download, Upload, Loader2 } from "lucide-react";
import {
  setLoraConfig, setDeviceConfig, setDisplayConfig, setPowerConfig,
  setPositionConfig, setBluetoothConfig, setSecurityConfig, setChannel,
} from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LoraConfigSection } from "./LoraConfigSection";
import { ChannelsSection } from "./ChannelsSection";
import { SecurityConfigSection } from "./SecurityConfigSection";
import { DeviceConfigSection } from "./DeviceConfigSection";
import { DisplayConfigSection } from "./DisplayConfigSection";
import { PowerConfigSection } from "./PowerConfigSection";
import { PositionConfigSection } from "./PositionConfigSection";
import { BluetoothConfigSection } from "./BluetoothConfigSection";
import type { DeviceConfigs, MeshChannel } from "@/stores/types";

// --- Config Import ---

const CONFIG_SECTIONS: Record<string, {
  label: string;
  send: (connId: string, config: Record<string, unknown>) => Promise<number[]>;
}> = {
  device: { label: "Device", send: setDeviceConfig },
  lora: { label: "LoRa", send: setLoraConfig },
  display: { label: "Display", send: setDisplayConfig },
  power: { label: "Power", send: setPowerConfig },
  position: { label: "Position", send: setPositionConfig },
  bluetooth: { label: "Bluetooth", send: setBluetoothConfig },
  security: { label: "Security", send: setSecurityConfig },
};

function ImportConfigButton({ connectionId, disabled }: { connectionId: string; disabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; backup: Record<string, unknown> } | null>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup || typeof backup.configs !== "object") {
        toast.error("Invalid backup file", { description: "Missing 'configs' section" });
        return;
      }

      const configKeys = Object.keys(backup.configs).filter((k) => k in CONFIG_SECTIONS);
      const channelCount = Array.isArray(backup.channels) ? backup.channels.length : 0;

      if (configKeys.length === 0 && channelCount === 0) {
        toast.error("Nothing to import", { description: "No recognized config sections or channels found" });
        return;
      }

      const parts: string[] = [];
      if (configKeys.length > 0) {
        parts.push(`Config sections: ${configKeys.map((k) => CONFIG_SECTIONS[k].label).join(", ")}`);
      }
      if (channelCount > 0) {
        parts.push(`Channels: ${channelCount}`);
      }
      if (backup.exportedAt) {
        parts.push(`Exported: ${new Date(backup.exportedAt).toLocaleString()}`);
      }

      setConfirm({ message: parts.join("\n"), backup });
    } catch {
      toast.error("Failed to read backup file", { description: "File is not valid JSON" });
    }
  }, []);

  const doImport = useCallback(async () => {
    if (!confirm) return;
    const { backup } = confirm;
    setConfirm(null);
    setImporting(true);

    let applied = 0;
    let failed = 0;

    try {
      // Apply config sections sequentially
      const configs = backup.configs as Record<string, Record<string, unknown>>;
      for (const [key, section] of Object.entries(CONFIG_SECTIONS)) {
        if (configs[key]) {
          try {
            const packetIds = await section.send(connectionId, configs[key]);
            const result = await trackAdminCommand(packetIds);
            if (result.status === "failed") {
              failed++;
            } else {
              applied++;
            }
          } catch {
            failed++;
          }
        }
      }

      // Apply channels sequentially
      if (Array.isArray(backup.channels)) {
        for (const ch of backup.channels) {
          try {
            const packetIds = await setChannel(connectionId, ch as Record<string, unknown>);
            const result = await trackAdminCommand(packetIds);
            if (result.status === "failed") {
              failed++;
            } else {
              applied++;
            }
          } catch {
            failed++;
          }
        }
      }

      if (failed === 0) {
        toast.success(`Config imported (${applied} sections applied)`, { description: "Device will reboot to apply changes" });
      } else {
        toast.warning(`Import partially complete`, { description: `${applied} applied, ${failed} failed` });
      }
    } catch (e) {
      toast.error("Import failed", { description: String(e) });
    } finally {
      setImporting(false);
    }
  }, [connectionId, confirm]);

  return (
    <>
      <ConfirmDialog
        open={confirm !== null}
        title="Import Configuration"
        message={confirm?.message ?? ""}
        confirmLabel="Apply to Device"
        onConfirm={doImport}
        onCancel={() => setConfirm(null)}
      />
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled || importing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Import config from JSON backup"
      >
        {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {importing ? "Importing..." : "Import Config"}
      </button>
    </>
  );
}

// --- Config Export ---

function ExportConfigButton({ deviceConfigs, channels }: { deviceConfigs: DeviceConfigs; channels: MeshChannel[] }) {
  const hasConfig = Object.keys(deviceConfigs).length > 0;

  const handleExport = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      configs: deviceConfigs,
      channels,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meshtastic-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!hasConfig}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="Export current config as JSON backup"
    >
      <Download size={12} />
      Export Backup
    </button>
  );
}

// --- Main Editor ---

export function RadioConfigEditor({
  connectionId,
  deviceConfigs,
  channels,
  isConnected,
  shortName,
}: {
  connectionId: string;
  deviceConfigs: DeviceConfigs;
  channels: MeshChannel[];
  isConnected: boolean;
  shortName?: string;
}) {
  const disabled = !isConnected;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {disabled && (
          <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-2 flex-1">
            <p className="text-xs text-yellow-400">
              Connect to a device to edit configuration
            </p>
          </div>
        )}
        {!disabled && <div />}
        <div className="flex items-center gap-2">
          <ImportConfigButton connectionId={connectionId} disabled={disabled} />
          <ExportConfigButton deviceConfigs={deviceConfigs} channels={channels} />
        </div>
      </div>
      <DeviceConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <LoraConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <ChannelsSection channels={channels} connectionId={connectionId} disabled={disabled} />
      <PowerConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <PositionConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <DisplayConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <BluetoothConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} />
      <SecurityConfigSection deviceConfigs={deviceConfigs} connectionId={connectionId} disabled={disabled} shortName={shortName} />
    </div>
  );
}
