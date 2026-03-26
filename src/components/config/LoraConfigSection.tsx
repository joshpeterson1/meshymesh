import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Radio, ChevronDown, ChevronRight } from "lucide-react";
import { setLoraConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormSelect, FormNumber, FormToggle, FormReadOnly, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const LORA_FIELD_LABELS: Record<string, string> = {
  region: "Region",
  modemPreset: "Modem Preset",
  channelNum: "Frequency Slot",
  hopLimit: "Hop Limit",
  txPower: "TX Power (dBm)",
  txEnabled: "TX Enabled",
  usePreset: "Use Preset",
  overrideDutyCycle: "Override Duty Cycle",
  ignoreMqtt: "Ignore MQTT",
  configOkToMqtt: "OK to MQTT",
  bandwidth: "Bandwidth",
  spreadFactor: "Spread Factor",
  codingRate: "Coding Rate",
  frequencyOffset: "Frequency Offset",
  overrideFrequency: "Override Frequency",
  sx126xRxBoostedGain: "RX Boosted Gain",
  paFanDisabled: "PA Fan Disabled",
};

const DANGEROUS_LORA_FIELDS: Record<string, string> = {
  region: "Changing the region may make your device transmit on illegal frequencies for your area.",
  channelNum: "Changing the frequency slot will disconnect you from all nodes on the current slot.",
  txEnabled: "Disabling TX will prevent your node from transmitting any packets.",
};

const MODEM_PRESETS = [
  { value: 0, label: "Long Fast" },
  { value: 1, label: "Long Slow" },
  { value: 2, label: "Very Long Slow" },
  { value: 3, label: "Medium Slow" },
  { value: 4, label: "Medium Fast" },
  { value: 5, label: "Short Slow" },
  { value: 6, label: "Short Fast" },
  { value: 7, label: "Long Moderate" },
  { value: 8, label: "Short Turbo" },
];

const REGIONS = [
  { value: 0, label: "Unset" },
  { value: 1, label: "US" },
  { value: 2, label: "EU 433" },
  { value: 3, label: "EU 868" },
  { value: 4, label: "CN" },
  { value: 5, label: "JP" },
  { value: 6, label: "ANZ" },
  { value: 7, label: "KR" },
  { value: 8, label: "TW" },
  { value: 9, label: "RU" },
  { value: 10, label: "IN" },
  { value: 11, label: "NZ 865" },
  { value: 12, label: "TH" },
  { value: 13, label: "LoRa 2.4GHz" },
  { value: 14, label: "UA 433" },
  { value: 15, label: "UA 868" },
  { value: 16, label: "MY 433" },
  { value: 17, label: "MY 919" },
  { value: 18, label: "SG 923" },
  { value: 19, label: "PH 433" },
  { value: 20, label: "PH 868" },
  { value: 21, label: "PH 915" },
];

export function LoraConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
}) {
  const raw = deviceConfigs.lora as Record<string, unknown> | undefined;
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (raw) setForm({ ...raw });
  }, [raw]);

  if (!raw) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-6 text-center">
        <p className="text-xs text-zinc-500">LoRa config not yet received</p>
      </div>
    );
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(raw);
  const changes = hasChanges ? diffConfigs(raw, form, LORA_FIELD_LABELS) : [];
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const doSave = useCallback(async () => {
    setShowDiff(false);
    setSaving(true);
    setError(null);
    try {
      const packetIds = await setLoraConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("LoRa config confirmed by device", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected LoRa config", { description: result.error });
      } else {
        toast.success("LoRa config sent", { description: "Device did not confirm — changes may still apply" });
      }
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save LoRa config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  const handleSave = () => {
    const warnings: string[] = [];
    for (const [field, warning] of Object.entries(DANGEROUS_LORA_FIELDS)) {
      if (raw[field] !== form[field]) warnings.push(warning);
    }
    if (warnings.length > 0) {
      setConfirm({ message: warnings.join("\n\n") });
    } else {
      setShowDiff(true);
    }
  };

  return (
    <div>
      <ConfirmDialog
        open={confirm !== null}
        title="Dangerous Configuration Change"
        message={confirm?.message ?? ""}
        confirmLabel="Continue"
        onConfirm={() => { setConfirm(null); setShowDiff(true); }}
        onCancel={() => setConfirm(null)}
      />
      <ChangesDialog
        open={showDiff}
        title="LoRa Configuration Changes"
        changes={changes}
        onConfirm={doSave}
        onCancel={() => setShowDiff(false)}
      />
      <SectionHeader
        icon={Radio}
        title="LoRa Configuration"
        right={
          <SaveButton onClick={handleSave} saving={saving} disabled={disabled} hasChanges={hasChanges} />
        }
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormSelect label="Region" value={form.region as number ?? 0} options={REGIONS} onChange={(v) => set("region", v)} disabled={disabled} />
        <FormSelect label="Modem Preset" value={form.modemPreset as number ?? 0} options={MODEM_PRESETS} onChange={(v) => set("modemPreset", v)} disabled={disabled} />
        <FormNumber label="Frequency Slot" value={form.channelNum as number ?? 0} min={0} max={100} onChange={(v) => set("channelNum", v)} disabled={disabled} hint="0 = hash-based default" />
        <FormNumber label="Hop Limit" value={form.hopLimit as number ?? 3} min={1} max={7} onChange={(v) => set("hopLimit", v)} disabled={disabled} />
        <FormNumber label="TX Power (dBm)" value={form.txPower as number ?? 0} min={0} max={30} onChange={(v) => set("txPower", v)} disabled={disabled} hint="0 = max legal for region" />
        <FormToggle label="TX Enabled" checked={form.txEnabled as boolean ?? true} onChange={(v) => set("txEnabled", v)} disabled={disabled} />
        <FormToggle label="Use Preset" checked={form.usePreset as boolean ?? true} onChange={(v) => set("usePreset", v)} disabled={disabled} />
        <FormToggle label="Override Duty Cycle" checked={form.overrideDutyCycle as boolean ?? false} onChange={(v) => set("overrideDutyCycle", v)} disabled={disabled} />
        <FormToggle label="Ignore MQTT" checked={form.ignoreMqtt as boolean ?? false} onChange={(v) => set("ignoreMqtt", v)} disabled={disabled} />
        <FormToggle label="OK to MQTT" checked={form.configOkToMqtt as boolean ?? false} onChange={(v) => set("configOkToMqtt", v)} disabled={disabled} />

        {/* Advanced (read-only) */}
        <div className="py-2 border-b border-zinc-800/50">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Advanced (read-only)
          </button>
        </div>
        {showAdvanced && (
          <>
            <FormReadOnly label="Bandwidth" value={raw.bandwidth ? `${raw.bandwidth} kHz` : "Auto (preset)"} hint="Only used when Use Preset is off" />
            <FormReadOnly label="Spread Factor" value={raw.spreadFactor ? String(raw.spreadFactor) : "Auto (preset)"} />
            <FormReadOnly label="Coding Rate" value={raw.codingRate ? `4/${raw.codingRate}` : "Auto (preset)"} />
            <FormReadOnly label="Frequency Offset" value={raw.frequencyOffset ? `${raw.frequencyOffset} Hz` : "0"} hint="Crystal calibration correction" />
            <FormReadOnly label="Override Frequency" value={raw.overrideFrequency ? `${raw.overrideFrequency} MHz` : "None"} hint="HAM operators only" />
            <FormReadOnly label="RX Boosted Gain" value={raw.sx126xRxBoostedGain ? "Enabled" : "Disabled"} hint="SX126x radios only" />
            <FormReadOnly label="PA Fan Disabled" value={raw.paFanDisabled ? "Yes" : "No"} />
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
