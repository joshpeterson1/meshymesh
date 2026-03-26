import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Radio, Hash, Shield, Save, Loader2, Download, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { setLoraConfig, setSecurityConfig, setChannel } from "@/lib/tauri";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import type { DeviceConfigs, MeshChannel } from "@/stores/types";

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

const SECURITY_FIELD_LABELS: Record<string, string> = {
  serialEnabled: "Serial Console Enabled",
  debugLogApiEnabled: "Debug Log API",
  adminChannelEnabled: "Admin Channel (Legacy)",
  isManaged: "Managed Mode",
};

// --- Dangerous change detection ---

const DANGEROUS_LORA_FIELDS: Record<string, string> = {
  region: "Changing the region may make your device transmit on illegal frequencies for your area.",
  channelNum: "Changing the frequency slot will disconnect you from all nodes on the current slot.",
  txEnabled: "Disabling TX will prevent your node from transmitting any packets.",
};

const DANGEROUS_SECURITY_FIELDS: Record<string, string> = {
  serialEnabled: "Disabling serial console will prevent you from configuring this device over USB.",
  isManaged: "Enabling Managed Mode will block all client apps from writing configuration. You will only be able to configure via PKC Remote Admin or the legacy Admin channel. Make sure remote admin is set up first.",
};

// --- LoRa Config Types & Options ---

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

// --- Shared Form Components ---

function FormSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
      <label className="text-sm text-zinc-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-zinc-800 text-sm text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none focus:border-zinc-500 disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormNumber({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
      <div>
        <label className="text-sm text-zinc-400">{label}</label>
        {hint && <div className="text-[10px] text-zinc-600">{hint}</div>}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-zinc-800 text-sm text-zinc-200 rounded px-2 py-1 w-20 text-right border border-zinc-700 outline-none focus:border-zinc-500 disabled:opacity-40"
      />
    </div>
  );
}

function FormToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
      <label className="text-sm text-zinc-400">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          "w-9 h-5 rounded-full transition-colors relative disabled:opacity-40",
          checked ? "bg-mesh-green" : "bg-zinc-700",
        )}
      >
        <div
          className={cn(
            "w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all",
            checked ? "left-[18px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}

function FormReadOnly({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
      <div>
        <label className="text-sm text-zinc-400">{label}</label>
        {hint && <div className="text-[10px] text-zinc-600">{hint}</div>}
      </div>
      <span className="text-sm text-zinc-500 font-mono">{value}</span>
    </div>
  );
}

function SaveButton({
  onClick,
  saving,
  disabled,
  hasChanges,
}: {
  onClick: () => void;
  saving: boolean;
  disabled: boolean;
  hasChanges: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving || !hasChanges}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
        hasChanges && !disabled
          ? "bg-mesh-green text-zinc-900 hover:bg-mesh-green/90"
          : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
      )}
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      {saving ? "Saving..." : "Save"}
    </button>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof Radio;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-zinc-500" />
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {right}
    </div>
  );
}

// --- LoRa Config Section ---

function LoraConfigSection({
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
      await setLoraConfig(connectionId, form);
      toast.success("LoRa config saved", { description: "Device will reboot to apply changes" });
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save LoRa config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  const handleSave = () => {
    // Check for dangerous changes first
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
          <SaveButton
            onClick={handleSave}
            saving={saving}
            disabled={disabled}
            hasChanges={hasChanges}
          />
        }
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormSelect
          label="Region"
          value={form.region as number ?? 0}
          options={REGIONS}
          onChange={(v) => set("region", v)}
          disabled={disabled}
        />
        <FormSelect
          label="Modem Preset"
          value={form.modemPreset as number ?? 0}
          options={MODEM_PRESETS}
          onChange={(v) => set("modemPreset", v)}
          disabled={disabled}
        />
        <FormNumber
          label="Frequency Slot"
          value={form.channelNum as number ?? 0}
          min={0}
          max={100}
          onChange={(v) => set("channelNum", v)}
          disabled={disabled}
          hint="0 = hash-based default"
        />
        <FormNumber
          label="Hop Limit"
          value={form.hopLimit as number ?? 3}
          min={1}
          max={7}
          onChange={(v) => set("hopLimit", v)}
          disabled={disabled}
        />
        <FormNumber
          label="TX Power (dBm)"
          value={form.txPower as number ?? 0}
          min={0}
          max={30}
          onChange={(v) => set("txPower", v)}
          disabled={disabled}
          hint="0 = max legal for region"
        />
        <FormToggle
          label="TX Enabled"
          checked={form.txEnabled as boolean ?? true}
          onChange={(v) => set("txEnabled", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Use Preset"
          checked={form.usePreset as boolean ?? true}
          onChange={(v) => set("usePreset", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Override Duty Cycle"
          checked={form.overrideDutyCycle as boolean ?? false}
          onChange={(v) => set("overrideDutyCycle", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Ignore MQTT"
          checked={form.ignoreMqtt as boolean ?? false}
          onChange={(v) => set("ignoreMqtt", v)}
          disabled={disabled}
        />
        <FormToggle
          label="OK to MQTT"
          checked={form.configOkToMqtt as boolean ?? false}
          onChange={(v) => set("configOkToMqtt", v)}
          disabled={disabled}
        />

        {/* Advanced (read-only) */}
        <div className="py-2 border-b border-zinc-800/50">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Advanced (read-only)
          </button>
        </div>
        {showAdvanced && (
          <>
            <FormReadOnly
              label="Bandwidth"
              value={raw.bandwidth ? `${raw.bandwidth} kHz` : "Auto (preset)"}
              hint="Only used when Use Preset is off"
            />
            <FormReadOnly
              label="Spread Factor"
              value={raw.spreadFactor ? String(raw.spreadFactor) : "Auto (preset)"}
            />
            <FormReadOnly
              label="Coding Rate"
              value={raw.codingRate ? `4/${raw.codingRate}` : "Auto (preset)"}
            />
            <FormReadOnly
              label="Frequency Offset"
              value={raw.frequencyOffset ? `${raw.frequencyOffset} Hz` : "0"}
              hint="Crystal calibration correction"
            />
            <FormReadOnly
              label="Override Frequency"
              value={raw.overrideFrequency ? `${raw.overrideFrequency} MHz` : "None"}
              hint="HAM operators only"
            />
            <FormReadOnly
              label="RX Boosted Gain"
              value={raw.sx126xRxBoostedGain ? "Enabled" : "Disabled"}
              hint="SX126x radios only"
            />
            <FormReadOnly
              label="PA Fan Disabled"
              value={raw.paFanDisabled ? "Yes" : "No"}
            />
          </>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}

// --- PSK Helpers ---

const PSK_OPTIONS = [
  { value: "none", label: "None (No Encryption)" },
  { value: "default", label: "Default Key (AES128)" },
  { value: "simple1", label: "Simple 1" },
  { value: "simple2", label: "Simple 2" },
  { value: "simple3", label: "Simple 3" },
  { value: "random16", label: "Random AES128 (16 bytes)" },
  { value: "random32", label: "Random AES256 (32 bytes)" },
  { value: "custom", label: "Custom Key" },
];

function describePsk(psk: number[]): string {
  if (psk.length === 0) return "None";
  if (psk.length === 1 && psk[0] === 0) return "None";
  if (psk.length === 1 && psk[0] === 1) return "Default (AES128)";
  if (psk.length === 1 && psk[0] >= 2 && psk[0] <= 10) return `Simple ${psk[0] - 1}`;
  if (psk.length === 16) return "AES128 (custom)";
  if (psk.length === 32) return "AES256 (custom)";
  return `${psk.length} bytes`;
}

function isCustomPsk(psk: number[]): boolean {
  return psk.length === 16 || psk.length === 32;
}

function pskToBase64(psk: number[]): string {
  return btoa(String.fromCharCode(...psk));
}

function pskToOption(psk: number[]): string {
  if (psk.length === 0 || (psk.length === 1 && psk[0] === 0)) return "none";
  if (psk.length === 1 && psk[0] === 1) return "default";
  if (psk.length === 1 && psk[0] >= 2 && psk[0] <= 4) return `simple${psk[0] - 1}`;
  return "custom";
}

function optionToPsk(option: string): number[] {
  switch (option) {
    case "none": return [0];
    case "default": return [1];
    case "simple1": return [2];
    case "simple2": return [3];
    case "simple3": return [4];
    case "random16": return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    case "random32": return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
    default: return [1];
  }
}

// --- Channels Section ---

const ROLE_OPTIONS = [
  { value: "secondary", label: "Secondary" },
  { value: "disabled", label: "Disabled" },
];

function ChannelEditor({
  channel,
  connectionId,
  disabled,
}: {
  channel: MeshChannel;
  connectionId: string;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: channel.name,
    role: channel.role as string,
    pskOption: pskToOption(channel.psk),
    uplinkEnabled: channel.uplinkEnabled,
    downlinkEnabled: channel.downlinkEnabled,
    positionPrecision: channel.positionPrecision,
    isClientMuted: channel.isClientMuted,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [showPsk, setShowPsk] = useState(false);

  const isPrimary = channel.role === "primary";
  const hasCustomKey = isCustomPsk(channel.psk);

  useEffect(() => {
    setForm({
      name: channel.name,
      role: channel.role,
      pskOption: pskToOption(channel.psk),
      uplinkEnabled: channel.uplinkEnabled,
      downlinkEnabled: channel.downlinkEnabled,
      positionPrecision: channel.positionPrecision,
      isClientMuted: channel.isClientMuted,
    });
  }, [channel]);

  const handleDiscard = () => {
    setForm({
      name: channel.name,
      role: channel.role,
      pskOption: pskToOption(channel.psk),
      uplinkEnabled: channel.uplinkEnabled,
      downlinkEnabled: channel.downlinkEnabled,
      positionPrecision: channel.positionPrecision,
      isClientMuted: channel.isClientMuted,
    });
    setEditing(false);
    setError(null);
  };

  const doSave = useCallback(async () => {
    if (form.name.length > 11) {
      setError("Name must be < 12 characters");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const roleInt = form.role === "primary" ? 1 : form.role === "secondary" ? 2 : 0;
      const psk = optionToPsk(form.pskOption);
      await setChannel(connectionId, {
        index: channel.index,
        role: roleInt,
        settings: {
          name: form.name,
          psk,
          id: 0,
          uplinkEnabled: form.uplinkEnabled,
          downlinkEnabled: form.downlinkEnabled,
          moduleSettings: {
            positionPrecision: form.positionPrecision,
            isClientMuted: form.isClientMuted,
          },
        },
      });
      setEditing(false);
      toast.success(`Channel ${channel.index} saved`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [connectionId, channel.index, form]);

  const handleSave = () => {
    const pskChanged = form.pskOption !== pskToOption(channel.psk);
    if (pskChanged) {
      setConfirm({
        message: "Changing the encryption key will disconnect you from all nodes using the current key on this channel.",
      });
    } else {
      doSave();
    }
  };

  return (
    <div className="px-4 py-3">
      <ConfirmDialog
        open={confirm !== null}
        title="Dangerous Channel Change"
        message={confirm?.message ?? ""}
        confirmLabel="Apply Changes"
        onConfirm={() => { setConfirm(null); doSave(); }}
        onCancel={() => setConfirm(null)}
      />

      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Hash size={14} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-200">
            {channel.index}: {channel.name || `Channel ${channel.index}`}
          </span>
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded",
              channel.role === "primary"
                ? "bg-mesh-green/15 text-mesh-green"
                : channel.role === "secondary"
                  ? "bg-blue-400/15 text-blue-400"
                  : "bg-zinc-800 text-zinc-500",
            )}
          >
            {channel.role}
          </span>
        </div>
        {!disabled && !editing && channel.role !== "disabled" && (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Edit
          </button>
        )}
        {!disabled && editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscard}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-[10px] text-mesh-green hover:text-mesh-green/80 font-medium transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Summary when not editing */}
      {!editing && (
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 flex gap-3 flex-wrap items-center">
            <span>Key: {describePsk(channel.psk)}</span>
            {hasCustomKey && (
              <button
                onClick={() => setShowPsk(!showPsk)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showPsk ? "Hide" : "Reveal"}
              </button>
            )}
            {channel.uplinkEnabled && <span className="text-blue-400">Uplink</span>}
            {channel.downlinkEnabled && <span className="text-blue-400">Downlink</span>}
            <span>Pos: {channel.positionPrecision === 0 ? "Off" : `${channel.positionPrecision} bits`}</span>
            {channel.isClientMuted && <span className="text-yellow-400">Muted</span>}
          </div>
          {hasCustomKey && showPsk && (
            <code className="text-[10px] text-zinc-500 font-mono break-all block">
              {pskToBase64(channel.psk)}
            </code>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="mt-2 space-y-0 bg-zinc-800/30 rounded-lg px-3 py-1">
          {/* Name */}
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-700/50">
            <label className="text-xs text-zinc-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={11}
              className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 w-28 border border-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>

          {/* Role (not editable for primary) */}
          {!isPrimary && (
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-700/50">
              <label className="text-xs text-zinc-400">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none focus:border-zinc-500"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* PSK */}
          <div className="py-1.5 border-b border-zinc-700/50">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Encryption Key</label>
              <select
                value={form.pskOption}
                onChange={(e) => setForm((f) => ({ ...f, pskOption: e.target.value }))}
                className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 outline-none focus:border-zinc-500"
              >
                {PSK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {hasCustomKey && form.pskOption === "custom" && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-500">Current key</span>
                  <button
                    onClick={() => setShowPsk(!showPsk)}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    {showPsk ? "Hide" : "Reveal"}
                  </button>
                </div>
                <code className="text-[10px] text-zinc-500 font-mono break-all block">
                  {showPsk ? pskToBase64(channel.psk) : "••••••••••••••••••••••••••••••••"}
                </code>
              </div>
            )}
          </div>

          {/* Uplink */}
          <FormToggle
            label="MQTT Uplink"
            checked={form.uplinkEnabled}
            onChange={(v) => setForm((f) => ({ ...f, uplinkEnabled: v }))}
          />

          {/* Downlink */}
          <FormToggle
            label="MQTT Downlink"
            checked={form.downlinkEnabled}
            onChange={(v) => setForm((f) => ({ ...f, downlinkEnabled: v }))}
          />

          {/* Position Precision */}
          <FormNumber
            label="Position Precision"
            value={form.positionPrecision}
            min={0}
            max={32}
            onChange={(v) => setForm((f) => ({ ...f, positionPrecision: v }))}
            hint="0 = no location, 32 = full precision"
          />

          {/* Client Muted */}
          <FormToggle
            label="Mute Notifications"
            checked={form.isClientMuted}
            onChange={(v) => setForm((f) => ({ ...f, isClientMuted: v }))}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function ChannelsSection({
  channels,
  connectionId,
  disabled,
}: {
  channels: MeshChannel[];
  connectionId: string;
  disabled: boolean;
}) {
  return (
    <div>
      <SectionHeader icon={Hash} title="Channels" />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800/50">
        {channels.length > 0 ? (
          channels.map((ch) => (
            <ChannelEditor
              key={ch.index}
              channel={ch}
              connectionId={connectionId}
              disabled={disabled}
            />
          ))
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-zinc-500">No channels received yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Security Config Section ---

// --- Key display helpers ---

function bytesToBase64(bytes: unknown): string {
  if (!Array.isArray(bytes) || bytes.length === 0) return "Not set";
  return btoa(String.fromCharCode(...(bytes as number[])));
}

function SecurityConfigSection({
  deviceConfigs,
  connectionId,
  disabled,
  shortName,
}: {
  deviceConfigs: DeviceConfigs;
  connectionId: string;
  disabled: boolean;
  shortName?: string;
}) {
  const raw = deviceConfigs.security as Record<string, unknown> | undefined;
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  useEffect(() => {
    if (raw) setForm({ ...raw });
  }, [raw]);

  if (!raw) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-6 text-center">
        <p className="text-xs text-zinc-500">Security config not yet received</p>
      </div>
    );
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(raw);
  const changes = hasChanges ? diffConfigs(raw, form, SECURITY_FIELD_LABELS) : [];
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const publicKeyB64 = bytesToBase64(raw.publicKey);
  const privateKeyB64 = bytesToBase64(raw.privateKey);
  const adminKeys = Array.isArray(raw.adminKey) ? (raw.adminKey as unknown[]) : [];

  const doSave = useCallback(async () => {
    setShowDiff(false);
    setSaving(true);
    setError(null);
    try {
      await setSecurityConfig(connectionId, form);
      toast.success("Security config saved", { description: "Device will reboot to apply changes" });
    } catch (e) {
      setError(String(e));
      toast.error("Failed to save security config", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [connectionId, form]);

  const handleSave = () => {
    const warnings: string[] = [];
    for (const [field, warning] of Object.entries(DANGEROUS_SECURITY_FIELDS)) {
      if (raw[field] !== form[field]) warnings.push(warning);
    }
    if (warnings.length > 0) {
      setConfirm({ message: warnings.join("\n\n") });
    } else {
      setShowDiff(true);
    }
  };

  const handleBackupKeys = () => {
    const lines = [
      `Meshtastic Key Backup`,
      `Node: ${shortName ?? "unknown"}`,
      `Date: ${new Date().toISOString()}`,
      ``,
      `Public Key:`,
      publicKeyB64,
      ``,
      `Private Key:`,
      privateKeyB64,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shortName ?? "node"}_keys.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        title="Security Configuration Changes"
        changes={changes}
        onConfirm={doSave}
        onCancel={() => setShowDiff(false)}
      />
      <SectionHeader
        icon={Shield}
        title="Security"
        right={
          <SaveButton
            onClick={handleSave}
            saving={saving}
            disabled={disabled}
            hasChanges={hasChanges}
          />
        }
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormToggle
          label="Serial Console Enabled"
          checked={form.serialEnabled as boolean ?? true}
          onChange={(v) => set("serialEnabled", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Debug Log API"
          checked={form.debugLogApiEnabled as boolean ?? false}
          onChange={(v) => set("debugLogApiEnabled", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Admin Channel (Legacy)"
          checked={form.adminChannelEnabled as boolean ?? false}
          onChange={(v) => set("adminChannelEnabled", v)}
          disabled={disabled}
        />
        <FormToggle
          label="Managed Mode"
          checked={form.isManaged as boolean ?? false}
          onChange={(v) => set("isManaged", v)}
          disabled={disabled}
        />

        {/* Keys (read-only) */}
        <div className="py-2 border-b border-zinc-800/50">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-zinc-400">Public Key</label>
            <button
              onClick={handleBackupKeys}
              disabled={publicKeyB64 === "Not set"}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              Backup Keys
            </button>
          </div>
          <code className="text-[10px] text-zinc-500 font-mono break-all block">
            {publicKeyB64}
          </code>
        </div>

        <div className="py-2 border-b border-zinc-800/50">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-zinc-400">Private Key</label>
            <button
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPrivateKey ? (
                <><ChevronDown size={10} /> Hide</>
              ) : (
                <><ChevronRight size={10} /> Reveal</>
              )}
            </button>
          </div>
          <code className="text-[10px] text-zinc-500 font-mono break-all block">
            {showPrivateKey ? privateKeyB64 : (privateKeyB64 !== "Not set" ? "••••••••••••••••" : "Not set")}
          </code>
        </div>

        {/* Admin Keys (read-only) */}
        <div className="py-2 border-b border-zinc-800/50">
          <label className="text-sm text-zinc-400">Admin Keys</label>
          {adminKeys.length > 0 ? (
            <div className="mt-1 space-y-1">
              {adminKeys.map((key, i) => (
                <code key={i} className="text-[10px] text-zinc-500 font-mono break-all block">
                  {bytesToBase64(key)}
                </code>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600 mt-1">No admin keys configured</p>
          )}
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}

// --- Main Export ---

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
      <LoraConfigSection
        deviceConfigs={deviceConfigs}
        connectionId={connectionId}
        disabled={disabled}
      />
      <ChannelsSection
        channels={channels}
        connectionId={connectionId}
        disabled={disabled}
      />
      <SecurityConfigSection
        deviceConfigs={deviceConfigs}
        connectionId={connectionId}
        disabled={disabled}
        shortName={shortName}
      />
    </div>
  );
}
