import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Battery } from "lucide-react";
import { setPowerConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormNumber, FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const FIELD_LABELS: Record<string, string> = {
  isPowerSaving: "Power Saving Mode",
  onBatteryShutdownAfterSecs: "Shutdown After (s)",
  adcMultiplierOverride: "ADC Multiplier Override",
  waitBluetoothSecs: "Wait Bluetooth (s)",
  sdsSecs: "Super Deep Sleep (s)",
  lsSecs: "Light Sleep (s)",
  minWakeSecs: "Min Wake (s)",
};

export function PowerConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.power as Record<string, unknown> | undefined;
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
        <p className="text-xs text-zinc-500">Power config not yet received</p>
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
      const packetIds = await setPowerConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Power config confirmed", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected config", { description: result.error });
      } else {
        toast.success("Power config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save power config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  return (
    <div>
      <ChangesDialog open={showDiff} title="Power Configuration Changes" changes={changes} onConfirm={doSave} onCancel={() => setShowDiff(false)} />
      <SectionHeader
        icon={Battery}
        title="Power"
        right={<SaveButton onClick={() => setShowDiff(true)} saving={saving} disabled={disabled} hasChanges={hasChanges} />}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormToggle label="Power Saving Mode" checked={form.isPowerSaving as boolean ?? false} onChange={(v) => set("isPowerSaving", v)} disabled={disabled} />
        <FormNumber label="Shutdown After (s)" value={form.onBatteryShutdownAfterSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("onBatteryShutdownAfterSecs", v)} disabled={disabled} hint="0 = never" />
        <FormNumber label="Wait Bluetooth (s)" value={form.waitBluetoothSecs as number ?? 0} min={0} max={3600} onChange={(v) => set("waitBluetoothSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Super Deep Sleep (s)" value={form.sdsSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("sdsSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Light Sleep (s)" value={form.lsSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("lsSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Min Wake (s)" value={form.minWakeSecs as number ?? 0} min={0} max={3600} onChange={(v) => set("minWakeSecs", v)} disabled={disabled} hint="0 = firmware default" />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
