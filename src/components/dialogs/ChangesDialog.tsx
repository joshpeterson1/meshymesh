import { List } from "lucide-react";

interface Change {
  field: string;
  oldValue: string;
  newValue: string;
}

interface ChangesDialogProps {
  open: boolean;
  title: string;
  changes: Change[];
  onConfirm: () => void;
  onCancel: () => void;
}

function formatValue(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v == null) return "—";
  return String(v);
}

export function diffConfigs(
  original: Record<string, unknown>,
  modified: Record<string, unknown>,
  labelMap?: Record<string, string>,
): Change[] {
  const changes: Change[] = [];
  for (const key of Object.keys(modified)) {
    if (JSON.stringify(original[key]) !== JSON.stringify(modified[key])) {
      changes.push({
        field: labelMap?.[key] ?? key,
        oldValue: formatValue(original[key]),
        newValue: formatValue(modified[key]),
      });
    }
  }
  return changes;
}

export function ChangesDialog({
  open,
  title,
  changes,
  onConfirm,
  onCancel,
}: ChangesDialogProps) {
  if (!open || changes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-5">
        <div className="flex items-center gap-2 mb-4">
          <List size={16} className="text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        </div>

        <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 divide-y divide-zinc-700/50 mb-4 max-h-64 overflow-y-auto">
          {changes.map((change) => (
            <div key={change.field} className="px-3 py-2">
              <div className="text-xs font-medium text-zinc-400 mb-1">
                {change.field}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-400/80 line-through font-mono">
                  {change.oldValue}
                </span>
                <span className="text-zinc-600">&rarr;</span>
                <span className="text-mesh-green font-mono">
                  {change.newValue}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-zinc-500">
            {changes.length} change{changes.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 text-xs font-medium text-zinc-900 bg-mesh-green hover:bg-mesh-green/90 rounded transition-colors"
            >
              Apply {changes.length} Change{changes.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
