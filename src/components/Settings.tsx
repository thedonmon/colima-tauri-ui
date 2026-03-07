import { useSettingsStore } from "../store/settings";

export function Settings() {
  const { hideOnFocusLoss, update } = useSettingsStore();

  return (
    <div className="px-4 py-4 space-y-5">
      <div>
        <p className="text-base font-semibold text-fg mb-1">Settings</p>
        <p className="text-xs text-fg-muted">Configure app behavior</p>
      </div>

      {/* Behavior section */}
      <div className="rounded-xl border border-border bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-fg-secondary mb-3">Behavior</p>

          <ToggleRow
            label="Hide window on focus loss"
            description="Automatically hide when you click outside (menu-bar popover style)"
            value={hideOnFocusLoss}
            onChange={(v) => update({ hideOnFocusLoss: v })}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full transition-colors ${
          value ? "bg-blue-500" : "bg-white/15"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
