import { cn } from "@/lib/utils";
import { Save, Loader2 } from "lucide-react";

export function FormSelect({
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

export function FormNumber({
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

export function FormToggle({
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

export function FormReadOnly({
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

export function SaveButton({
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

export function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
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
