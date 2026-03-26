import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Monitor } from "lucide-react";
import { setDisplayConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormSelect, FormNumber, FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const FIELD_LABELS: Record<string, string> = {
  screenOnSecs: "Screen On (s)",
  gpsFormat: "GPS Format",
  autoScreenCarouselSecs: "Carousel Interval (s)",
  compassNorthTop: "Compass North Top",
  flipScreen: "Flip Screen",
  units: "Units",
  oled: "OLED Type",
  displaymode: "Display Mode",
  headingBold: "Heading Bold",
  wakeOnTapOrMotion: "Wake on Tap/Motion",
};

const GPS_FORMATS = [
  { value: 0, label: "Decimal Degrees" },
  { value: 1, label: "DMS" },
  { value: 2, label: "UTM" },
  { value: 3, label: "MGRS" },
  { value: 4, label: "OLC" },
  { value: 5, label: "OSGR" },
];

const UNITS = [
  { value: 0, label: "Metric" },
  { value: 1, label: "Imperial" },
];

const OLED_TYPES = [
  { value: 0, label: "Auto" },
  { value: 1, label: "SSD1306" },
  { value: 2, label: "SH1106" },
  { value: 3, label: "SH1107" },
];

const DISPLAY_MODES = [
  { value: 0, label: "Default" },
  { value: 1, label: "TwoColor" },
  { value: 2, label: "Inverted" },
  { value: 3, label: "Color" },
];

export function DisplayConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.display as Record<string, unknown> | undefined;
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
        <p className="text-xs text-zinc-500">Display config not yet received</p>
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
      const packetIds = await setDisplayConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Display config confirmed", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected config", { description: result.error });
      } else {
        toast.success("Display config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save display config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  return (
    <div>
      <ChangesDialog open={showDiff} title="Display Configuration Changes" changes={changes} onConfirm={doSave} onCancel={() => setShowDiff(false)} />
      <SectionHeader
        icon={Monitor}
        title="Display"
        right={<SaveButton onClick={() => setShowDiff(true)} saving={saving} disabled={disabled} hasChanges={hasChanges} />}
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormNumber label="Screen On (s)" value={form.screenOnSecs as number ?? 0} min={0} max={86400} onChange={(v) => set("screenOnSecs", v)} disabled={disabled} hint="0 = firmware default" />
        <FormNumber label="Carousel Interval (s)" value={form.autoScreenCarouselSecs as number ?? 0} min={0} max={3600} onChange={(v) => set("autoScreenCarouselSecs", v)} disabled={disabled} hint="0 = disabled" />
        <FormSelect label="GPS Format" value={form.gpsFormat as number ?? 0} options={GPS_FORMATS} onChange={(v) => set("gpsFormat", v)} disabled={disabled} />
        <FormSelect label="Units" value={form.units as number ?? 0} options={UNITS} onChange={(v) => set("units", v)} disabled={disabled} />
        <FormSelect label="OLED Type" value={form.oled as number ?? 0} options={OLED_TYPES} onChange={(v) => set("oled", v)} disabled={disabled} />
        <FormSelect label="Display Mode" value={form.displaymode as number ?? 0} options={DISPLAY_MODES} onChange={(v) => set("displaymode", v)} disabled={disabled} />
        <FormToggle label="Compass North Top" checked={form.compassNorthTop as boolean ?? false} onChange={(v) => set("compassNorthTop", v)} disabled={disabled} />
        <FormToggle label="Flip Screen" checked={form.flipScreen as boolean ?? false} onChange={(v) => set("flipScreen", v)} disabled={disabled} />
        <FormToggle label="Heading Bold" checked={form.headingBold as boolean ?? false} onChange={(v) => set("headingBold", v)} disabled={disabled} />
        <FormToggle label="Wake on Tap/Motion" checked={form.wakeOnTapOrMotion as boolean ?? false} onChange={(v) => set("wakeOnTapOrMotion", v)} disabled={disabled} />
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
