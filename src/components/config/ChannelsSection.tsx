import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { setChannel } from "@/lib/tauri";
import { trackAdminCommand } from "@/lib/adminTracker";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { FormToggle, FormNumber, SectionHeader } from "./FormFields";
import type { MeshChannel } from "@/stores/types";

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

// --- Channel Editor ---

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
      const packetIds = await setChannel(connectionId, {
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
      const result = await trackAdminCommand(packetIds);
      setEditing(false);
      if (result.status === "confirmed") {
        toast.success(`Channel ${channel.index} confirmed by device`);
      } else if (result.status === "failed") {
        setError(result.error);
        toast.error(`Channel ${channel.index} rejected`, { description: result.error });
      } else {
        toast.success(`Channel ${channel.index} sent`);
      }
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
          <button onClick={() => setEditing(true)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            Edit
          </button>
        )}
        {!disabled && editing && (
          <div className="flex items-center gap-2">
            <button onClick={handleDiscard} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Discard
            </button>
            <button onClick={handleSave} disabled={saving} className="text-[10px] text-mesh-green hover:text-mesh-green/80 font-medium transition-colors">
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
              <button onClick={() => setShowPsk(!showPsk)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
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
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-700/50">
            <label className="text-xs text-zinc-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={11}
              className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 w-28 border border-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>
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
                  <button onClick={() => setShowPsk(!showPsk)} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                    {showPsk ? "Hide" : "Reveal"}
                  </button>
                </div>
                <code className="text-[10px] text-zinc-500 font-mono break-all block">
                  {showPsk ? pskToBase64(channel.psk) : "••••••••••••••••••••••••••••••••"}
                </code>
              </div>
            )}
          </div>
          <FormToggle label="MQTT Uplink" checked={form.uplinkEnabled} onChange={(v) => setForm((f) => ({ ...f, uplinkEnabled: v }))} />
          <FormToggle label="MQTT Downlink" checked={form.downlinkEnabled} onChange={(v) => setForm((f) => ({ ...f, downlinkEnabled: v }))} />
          <FormNumber label="Position Precision" value={form.positionPrecision} min={0} max={32} onChange={(v) => setForm((f) => ({ ...f, positionPrecision: v }))} hint="0 = no location, 32 = full precision" />
          <FormToggle label="Mute Notifications" checked={form.isClientMuted} onChange={(v) => setForm((f) => ({ ...f, isClientMuted: v }))} />
        </div>
      )}

      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// --- Channels Section (public) ---

export function ChannelsSection({
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
            <ChannelEditor key={ch.index} channel={ch} connectionId={connectionId} disabled={disabled} />
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
