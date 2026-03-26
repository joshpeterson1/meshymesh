import { Download } from "lucide-react";
import { LoraConfigSection } from "./LoraConfigSection";
import { ChannelsSection } from "./ChannelsSection";
import { SecurityConfigSection } from "./SecurityConfigSection";
import { DeviceConfigSection } from "./DeviceConfigSection";
import { DisplayConfigSection } from "./DisplayConfigSection";
import { PowerConfigSection } from "./PowerConfigSection";
import { PositionConfigSection } from "./PositionConfigSection";
import { BluetoothConfigSection } from "./BluetoothConfigSection";
import type { DeviceConfigs, MeshChannel } from "@/stores/types";

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
        <ExportConfigButton deviceConfigs={deviceConfigs} channels={channels} />
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
