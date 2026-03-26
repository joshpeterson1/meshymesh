import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";
import { setSecurityConfig } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ChangesDialog, diffConfigs } from "@/components/dialogs/ChangesDialog";
import { FormToggle, SaveButton, SectionHeader } from "./FormFields";
import type { DeviceConfigs } from "@/stores/types";

const SECURITY_FIELD_LABELS: Record<string, string> = {
  serialEnabled: "Serial Console Enabled",
  debugLogApiEnabled: "Debug Log API",
  adminChannelEnabled: "Admin Channel (Legacy)",
  isManaged: "Managed Mode",
};

const DANGEROUS_SECURITY_FIELDS: Record<string, string> = {
  serialEnabled: "Disabling serial console will prevent you from configuring this device over USB.",
  isManaged: "Enabling Managed Mode will block all client apps from writing configuration. You will only be able to configure via PKC Remote Admin or the legacy Admin channel. Make sure remote admin is set up first.",
};

function bytesToBase64(bytes: unknown): string {
  if (!Array.isArray(bytes) || bytes.length === 0) return "Not set";
  return btoa(String.fromCharCode(...(bytes as number[])));
}

export function SecurityConfigSection({
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
      const packetIds = await setSecurityConfig(connectionId, form);
      const result = await trackAdminCommand(packetIds);
      if (result.status === "confirmed") {
        toast.success("Security config confirmed by device", { description: "Device will reboot to apply changes" });
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error("Device rejected security config", { description: result.error });
      } else {
        toast.success("Security config sent", { description: "Device did not confirm — changes may still apply" });
      }
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
          <SaveButton onClick={handleSave} saving={saving} disabled={disabled} hasChanges={hasChanges} />
        }
      />
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-1">
        <FormToggle label="Serial Console Enabled" checked={form.serialEnabled as boolean ?? true} onChange={(v) => set("serialEnabled", v)} disabled={disabled} />
        <FormToggle label="Debug Log API" checked={form.debugLogApiEnabled as boolean ?? false} onChange={(v) => set("debugLogApiEnabled", v)} disabled={disabled} />
        <FormToggle label="Admin Channel (Legacy)" checked={form.adminChannelEnabled as boolean ?? false} onChange={(v) => set("adminChannelEnabled", v)} disabled={disabled} />
        <FormToggle label="Managed Mode" checked={form.isManaged as boolean ?? false} onChange={(v) => set("isManaged", v)} disabled={disabled} />

        {/* Keys (read-only) */}
        <div className="py-2 border-b border-zinc-800/50">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-zinc-400">Public Key</label>
            <button onClick={handleBackupKeys} disabled={publicKeyB64 === "Not set"} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">
              Backup Keys
            </button>
          </div>
          <code className="text-[10px] text-zinc-500 font-mono break-all block">{publicKeyB64}</code>
        </div>

        <div className="py-2 border-b border-zinc-800/50">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-zinc-400">Private Key</label>
            <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              {showPrivateKey ? <><ChevronDown size={10} /> Hide</> : <><ChevronRight size={10} /> Reveal</>}
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
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
