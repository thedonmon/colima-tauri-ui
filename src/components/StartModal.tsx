import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useColimaStore } from "../store";
import { useSettingsStore } from "../store/settings";
import type { StartOptions } from "../types";

interface StartModalProps {
  initialProfile?: string;
  onClose: () => void;
  onStarted: () => void;
}

export function StartModal({ initialProfile, onClose, onStarted }: StartModalProps) {
  const { startInstance } = useColimaStore();
  const { defaultVmPreset } = useSettingsStore();

  const [profile, setProfile] = useState(initialProfile ?? "default");
  const [cpu, setCpu] = useState(defaultVmPreset.cpu);
  const [memory, setMemory] = useState(defaultVmPreset.memory);
  const [disk, setDisk] = useState(defaultVmPreset.disk);
  const [vmType, setVmType] = useState(defaultVmPreset.vmType);
  const [runtime, setRuntime] = useState(defaultVmPreset.runtime);
  const [rosetta, setRosetta] = useState(defaultVmPreset.rosetta);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!profile.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const options: StartOptions = {
        profile: profile.trim(),
        cpu,
        memory,
        disk,
        vmType,
        runtime,
        rosetta: vmType === "vz" && rosetta,
      };
      onClose();
      onStarted();
      await startInstance(options);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
      <div className="w-full bg-panel-alt border border-white/10 rounded-t-2xl p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-fg">Start Instance</h2>
          <button
            onClick={onClose}
            className="text-fg-faint hover:text-fg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Profile name */}
          <Field label="Profile">
            <input
              type="text"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="default"
              className="w-full rounded-lg bg-white/[0.06] border border-border px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all"
            />
          </Field>

          {/* CPU */}
          <SliderField
            label="CPU"
            value={cpu}
            min={1}
            max={16}
            unit="cores"
            onChange={setCpu}
          />

          {/* Memory */}
          <SliderField
            label="Memory"
            value={memory}
            min={2}
            max={64}
            unit="GiB"
            onChange={setMemory}
          />

          {/* Disk */}
          <SliderField
            label="Disk"
            value={disk}
            min={20}
            max={200}
            step={10}
            unit="GiB"
            onChange={setDisk}
          />

          {/* VM Type */}
          <Field label="VM Type">
            <SegmentedControl
              options={[
                { label: "VZ (Apple)", value: "vz" },
                { label: "QEMU", value: "qemu" },
              ]}
              value={vmType}
              onChange={setVmType}
            />
          </Field>

          {/* Runtime */}
          <Field label="Runtime">
            <SegmentedControl
              options={[
                { label: "Docker", value: "docker" },
                { label: "containerd", value: "containerd" },
              ]}
              value={runtime}
              onChange={setRuntime}
            />
          </Field>

          {/* Rosetta (VZ only) */}
          {vmType === "vz" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">Rosetta (x86 emulation)</span>
              <Toggle value={rosetta} onChange={setRosetta} />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-white/[0.06] py-2.5 text-sm text-fg-secondary hover:bg-white/[0.1] hover:text-fg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={busy || !profile.trim()}
              className="flex-1 rounded-lg bg-blue-500 py-2.5 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-fg-muted font-medium uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}

function SliderField({ label, value, min, max, step = 1, unit, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-fg-muted font-medium uppercase tracking-wide">
          {label}
        </label>
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
      <div className="flex justify-between text-xs text-fg-faint">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

interface SegmentedControlProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}

function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="flex rounded-lg bg-white/[0.04] border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
        value ? "bg-blue-500" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
