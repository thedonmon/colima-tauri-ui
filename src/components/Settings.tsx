import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settings";
import type { DefaultVmPreset } from "../store/settings";
import type { UpdateInfo } from "../types";

export function Settings() {
  const { hideOnFocusLoss, notifications, defaultVmPreset, update } =
    useSettingsStore();

  const updatePreset = (partial: Partial<DefaultVmPreset>) => {
    update({ defaultVmPreset: { ...defaultVmPreset, ...partial } });
  };

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateError(null);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <p className="text-base font-semibold text-fg mb-1">Settings</p>
        <p className="text-xs text-fg-muted">Configure app behavior</p>
      </div>

      {/* Behavior */}
      <Section title="Behavior">
        <ToggleRow
          label="Hide window on focus loss"
          description="Auto-hide when you click outside (menu-bar popover style)"
          value={hideOnFocusLoss}
          onChange={(v) => update({ hideOnFocusLoss: v })}
        />
        <ToggleRow
          label="Desktop notifications"
          description="Notify when instances start, stop, or encounter errors"
          value={notifications}
          onChange={(v) => update({ notifications: v })}
        />
      </Section>

      {/* Updates */}
      <Section title="Updates">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-fg">Check for updates</p>
              <p className="text-xs text-fg-muted leading-relaxed">
                {updateInfo
                  ? `Current: v${updateInfo.currentVersion} · Latest: v${updateInfo.latestVersion}`
                  : "Check if a newer version is available"}
              </p>
            </div>
            <button
              onClick={handleCheckUpdate}
              disabled={checking}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-all disabled:opacity-40"
            >
              {checking ? "Checking..." : "Check now"}
            </button>
          </div>

          {updateError && (
            <p className="text-xs text-red-400/80">{updateError}</p>
          )}

          {updateInfo && !updateInfo.hasUpdate && (
            <p className="text-xs text-emerald-400/80">You're on the latest version.</p>
          )}

          {updateInfo?.hasUpdate && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
              <p className="text-sm text-blue-400 font-medium">
                v{updateInfo.latestVersion} is available!
              </p>
              {updateInfo.releaseNotes && (
                <p className="text-xs text-fg-muted leading-relaxed line-clamp-4">
                  {updateInfo.releaseNotes}
                </p>
              )}
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-blue-400 underline hover:text-blue-300 transition-colors"
              >
                View release on GitHub
              </a>
            </div>
          )}
        </div>
      </Section>

      {/* Default VM Preset */}
      <Section title="Default VM Preset">
        <p className="text-xs text-fg-faint mb-3">
          Pre-fill these values when creating a new instance
        </p>

        <div className="space-y-3">
          <SliderRow
            label="CPU"
            value={defaultVmPreset.cpu}
            min={1}
            max={16}
            unit="cores"
            onChange={(v) => updatePreset({ cpu: v })}
          />
          <SliderRow
            label="Memory"
            value={defaultVmPreset.memory}
            min={2}
            max={64}
            unit="GiB"
            onChange={(v) => updatePreset({ memory: v })}
          />
          <SliderRow
            label="Disk"
            value={defaultVmPreset.disk}
            min={20}
            max={200}
            step={10}
            unit="GiB"
            onChange={(v) => updatePreset({ disk: v })}
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-fg-muted">VM Type</span>
            <SegmentedMini
              options={[
                { label: "VZ", value: "vz" },
                { label: "QEMU", value: "qemu" },
              ]}
              value={defaultVmPreset.vmType}
              onChange={(v) => updatePreset({ vmType: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Runtime</span>
            <SegmentedMini
              options={[
                { label: "Docker", value: "docker" },
                { label: "containerd", value: "containerd" },
              ]}
              value={defaultVmPreset.runtime}
              onChange={(v) => updatePreset({ runtime: v })}
            />
          </div>

          {defaultVmPreset.vmType === "vz" && (
            <ToggleRow
              label="Rosetta"
              description="Enable x86 emulation (VZ only)"
              value={defaultVmPreset.rosetta}
              onChange={(v) => updatePreset({ rosetta: v })}
            />
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-fg-secondary mb-3">{title}</p>
        <div className="space-y-1">{children}</div>
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

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-fg-muted">{label}</span>
        <span className="text-sm text-fg font-mono">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
    </div>
  );
}

function SegmentedMini({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg bg-white/[0.04] border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
            value === opt.value
              ? "bg-white/15 text-fg shadow-sm"
              : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
