import { useState, type ReactNode } from "react";
import { Play, X } from "lucide-react";
import { useColimaStore } from "../store";
import { useSettingsStore } from "../store/settings";
import { Toggle } from "./ui/Toggle";
import { Segmented } from "./ui/Segmented";
import { Slider } from "./ui/Slider";
import { IconButton } from "./ui/Button";
import type { StartOptions } from "../types";

interface StartModalProps {
  initialProfile?: string;
  onClose: () => void;
  onStarted: () => void;
}

export function StartModal({ initialProfile, onClose, onStarted }: StartModalProps) {
  const startInstance = useColimaStore((s) => s.startInstance);
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
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-overlay">
      <div className="w-full bg-panel-alt/95 backdrop-blur-xl border-t border-stroke border-x border-x-white/10 rounded-t-panel p-5 shadow-2xl animate-sheet">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-fg">New instance</h2>
          <IconButton icon={<X size={15} />} onClick={onClose} title="Close" />
        </div>

        <div className="space-y-4">
          {/* Profile name */}
          <Field label="Profile">
            <input
              type="text"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="default"
              className="w-full rounded-ctl bg-surface border border-border px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-blue-500/50 focus:bg-surface-raised transition-all"
            />
          </Field>

          <Slider label="CPU" value={cpu} min={1} max={16} unit="cores" onChange={setCpu} bounds />
          <Slider label="Memory" value={memory} min={2} max={64} unit="GiB" onChange={setMemory} bounds />
          <Slider label="Disk" value={disk} min={20} max={200} step={10} unit="GiB" onChange={setDisk} bounds />

          <div className="grid grid-cols-2 gap-3">
            <Field label="VM Type">
              <Segmented
                accent="primary"
                options={[
                  { label: "VZ", value: "vz" },
                  { label: "QEMU", value: "qemu" },
                ]}
                value={vmType}
                onChange={setVmType}
              />
            </Field>
            <Field label="Runtime">
              <Segmented
                accent="primary"
                options={[
                  { label: "Docker", value: "docker" },
                  { label: "containerd", value: "containerd" },
                ]}
                value={runtime}
                onChange={setRuntime}
              />
            </Field>
          </div>

          {/* Rosetta (VZ only) */}
          {vmType === "vz" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">Rosetta (x86 emulation)</span>
              <Toggle value={rosetta} onChange={setRosetta} />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-ctl px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-surface-raised border border-border py-2.5 text-sm font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={busy || !profile.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-blue-500/20 border border-blue-500/30 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Play size={13} />
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
