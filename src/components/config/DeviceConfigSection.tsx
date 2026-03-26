import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Cpu } from "lucide-react";
import { setDeviceConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormSelect, FormNumber, FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const FIELD_LABELS: Record<string, string> = {
  role: "Device Role",
  serialEnabled: "Serial Console",
  buttonGpio: "Button GPIO",
  buzzerGpio: "Buzzer GPIO",
  rebroadcastMode: "Rebroadcast Mode",
  nodeInfoBroadcastSecs: "NodeInfo Broadcast (s)",
  doubleTapAsButtonPress: "Double Tap as Button",
  isManaged: "Managed Mode",
  disableTripleClick: "Disable Triple Click",
  ledHeartbeatDisabled: "LED Heartbeat Disabled",
};

const DEVICE_ROLES = [
  { value: 0, label: "Client" },
  { value: 1, label: "Client Mute" },
  { value: 2, label: "Router" },
  { value: 3, label: "Router Client" },
  { value: 4, label: "Repeater" },
  { value: 5, label: "Tracker" },
  { value: 6, label: "Sensor" },
  { value: 7, label: "TAK" },
  { value: 8, label: "Client Hidden" },
  { value: 9, label: "Lost and Found" },
  { value: 10, label: "TAK Tracker" },
];

const REBROADCAST_MODES = [
  { value: 0, label: "All" },
  { value: 1, label: "All Skip Decoding" },
  { value: 2, label: "Local Only" },
  { value: 3, label: "Known Only" },
];

export function DeviceConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.device as Record<string, unknown> | undefined;
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
        <p className="text-xs text-zinc-500">Device config not yet received</p>
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
      const packetIds = await setDeviceConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Device config confirmed", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected config", { description: result.error });
      } else {
        toast.success("Device config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save device config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  return (
    <div>
      <ChangesDialog open={showDiff} title="Device Configuration Changes" changes={changes} onConfirm={doSave} onCancel={() => setShowDiff(false)} />
      <SectionHeader
        icon={Cpu}
        title="Device"
        right={<SaveButton onClick={() => setShowDiff(true)} saving={saving} disabled={disabled} hasChanges={hasChanges} />}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormSelect label="Device Role" value={form.role as number ?? 0} options={DEVICE_ROLES} onChange={(v) => set("role", v)} disabled={disabled} />
        <FormSelect label="Rebroadcast Mode" value={form.rebroadcastMode as number ?? 0} options={REBROADCAST_MODES} onChange={(v) => set("rebroadcastMode", v)} disabled={disabled} />
        <FormNumber label="NodeInfo Broadcast (s)" value={form.nodeInfoBroadcastSecs as number ?? 900} min={0} max={86400} onChange={(v) => set("nodeInfoBroadcastSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormToggle label="Double Tap as Button" checked={form.doubleTapAsButtonPress as boolean ?? false} onChange={(v) => set("doubleTapAsButtonPress", v)} disabled={disabled} />
        <FormToggle label="Disable Triple Click" checked={form.disableTripleClick as boolean ?? false} onChange={(v) => set("disableTripleClick", v)} disabled={disabled} />
        <FormToggle label="LED Heartbeat Disabled" checked={form.ledHeartbeatDisabled as boolean ?? false} onChange={(v) => set("ledHeartbeatDisabled", v)} disabled={disabled} />
        <FormNumber label="Button GPIO" value={form.buttonGpio as number ?? 0} min={0} max={39} onChange={(v) => set("buttonGpio", v)} disabled={disabled} hint="0 = default" />
        <FormNumber label="Buzzer GPIO" value={form.buzzerGpio as number ?? 0} min={0} max={39} onChange={(v) => set("buzzerGpio", v)} disabled={disabled} hint="0 = default" />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
