import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Bluetooth } from "lucide-react";
import { setBluetoothConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormSelect, FormNumber, FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const FIELD_LABELS: Record<string, string> = {
  enabled: "Bluetooth Enabled",
  mode: "Pairing Mode",
  fixedPin: "Fixed PIN",
};

const BT_MODES = [
  { value: 0, label: "Random PIN" },
  { value: 1, label: "Fixed PIN" },
  { value: 2, label: "No PIN" },
];

export function BluetoothConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.bluetooth as Record<string, unknown> | undefined;
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (raw) setForm({ ...raw });
  }, [raw]);

  if (!raw) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-6 text-center">
        <p className="text-xs text-zinc-500">Bluetooth config not yet received</p>
      </div>
    );
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(raw);
  const changes = hasChanges ? diffConfigs(raw, form, FIELD_LABELS) : [];
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const doSave = useCallback(async () => {
    setShowDiff(false);
    setSaving(true);
    setError(null);
    try {
      const packetIds = await setBluetoothConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Bluetooth config confirmed", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected config", { description: result.error });
      } else {
        toast.success("Bluetooth config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save Bluetooth config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  return (
    <div>
      <ChangesDialog open={showDiff} title="Bluetooth Configuration Changes" changes={changes} onConfirm={doSave} onCancel={() => setShowDiff(false)} />
      <SectionHeader
        icon={Bluetooth}
        title="Bluetooth"
        right={<SaveButton onClick={() => setShowDiff(true)} saving={saving} disabled={disabled} hasChanges={hasChanges} />}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormToggle label="Bluetooth Enabled" checked={form.enabled as boolean ?? true} onChange={(v) => set("enabled", v)} disabled={disabled} />
        <FormSelect label="Pairing Mode" value={form.mode as number ?? 0} options={BT_MODES} onChange={(v) => set("mode", v)} disabled={disabled} />
        <FormNumber label="Fixed PIN" value={form.fixedPin as number ?? 123456} min={0} max={999999} onChange={(v) => set("fixedPin", v)} disabled={disabled} hint="Only used with Fixed PIN mode" />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
