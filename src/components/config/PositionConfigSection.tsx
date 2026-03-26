import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { setPositionConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormNumber, FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const FIELD_LABELS: Record<string, string> = {
  positionBroadcastSecs: "Broadcast Interval (s)",
  positionBroadcastSmartEnabled: "Smart Broadcast",
  fixedPosition: "Fixed Position",
  gpsEnabled: "GPS Enabled",
  gpsUpdateInterval: "GPS Update Interval (s)",
  broadcastSmartMinimumDistance: "Smart Min Distance (m)",
  broadcastSmartMinimumIntervalSecs: "Smart Min Interval (s)",
  rxGpio: "RX GPIO",
  txGpio: "TX GPIO",
  gpsEnGpio: "GPS Enable GPIO",
};

export function PositionConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.position as Record<string, unknown> | undefined;
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
        <p className="text-xs text-zinc-500">Position config not yet received</p>
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
      const packetIds = await setPositionConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Position config confirmed", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected config", { description: result.error });
      } else {
        toast.success("Position config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save position config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  return (
    <div>
      <ChangesDialog open={showDiff} title="Position Configuration Changes" changes={changes} onConfirm={doSave} onCancel={() => setShowDiff(false)} />
      <SectionHeader
        icon={MapPin}
        title="Position"
        right={<SaveButton onClick={() => setShowDiff(true)} saving={saving} disabled={disabled} hasChanges={hasChanges} />}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormToggle label="GPS Enabled" checked={form.gpsEnabled as boolean ?? true} onChange={(v) => set("gpsEnabled", v)} disabled={disabled} />
        <FormToggle label="Fixed Position" checked={form.fixedPosition as boolean ?? false} onChange={(v) => set("fixedPosition", v)} disabled={disabled} />
        <FormToggle label="Smart Broadcast" checked={form.positionBroadcastSmartEnabled as boolean ?? true} onChange={(v) => set("positionBroadcastSmartEnabled", v)} disabled={disabled} />
        <FormNumber label="Broadcast Interval (s)" value={form.positionBroadcastSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("positionBroadcastSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="GPS Update Interval (s)" value={form.gpsUpdateInterval as number ?? 0} min={0} max={86400} onChange={(v) => set("gpsUpdateInterval", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Smart Min Distance (m)" value={form.broadcastSmartMinimumDistance as number ?? 0} min={0} max={100000} onChange={(v) => set("broadcastSmartMinimumDistance", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Smart Min Interval (s)" value={form.broadcastSmartMinimumIntervalSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("broadcastSmartMinimumIntervalSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="RX GPIO" value={form.rxGpio as number ?? 0} min={0} max={39} onChange={(v) => set("rxGpio", v)} disabled={disabled} hint="0 = default" />
        <FormNumber label="TX GPIO" value={form.txGpio as number ?? 0} min={0} max={39} onChange={(v) => set("txGpio", v)} disabled={disabled} hint="0 = default" />
        <FormNumber label="GPS Enable GPIO" value={form.gpsEnGpio as number ?? 0} min={0} max={39} onChange={(v) => set("gpsEnGpio", v)} disabled={disabled} hint="0 = default" />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
