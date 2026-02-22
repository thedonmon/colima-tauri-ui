import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useColimaStore } from "../store";
import type { StartOptions } from "../types";

interface StartModalProps {
  initialProfile?: string;
  onClose: () => void;
  onStarted: () => void; // called so parent can open the log drawer
}

export function StartModal({ initialProfile, onClose, onStarted }: StartModalProps) {
  const { startInstance } = useColimaStore();

  const [profile, setProfile] = useState(initialProfile ?? "default");
  const [cpu, setCpu] = useState(4);
  const [memory, setMemory] = useState(8);
  const [disk, setDisk] = useState(60);
  const [vmType, setVmType] = useState("vz");
  const [runtime, setRuntime] = useState("docker");
  const [rosetta, setRosetta] = useState(true);

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
      <div className="w-full bg-[#1e1f23] border border-white/10 rounded-t-2xl p-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#e0e0e0]">Start Instance</h2>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-[#909296] transition-colors"
          >
            <X size={14} />
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
              className="w-full rounded-lg bg-white/8 border border-white/8 px-3 py-1.5 text-[12px] text-[#c1c2c5] placeholder:text-[#444] outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
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
              <span className="text-[11px] text-[#666]">Rosetta (x86 emulation)</span>
              <Toggle value={rosetta} onChange={setRosetta} />
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-white/8 py-2 text-[12px] text-[#909296] hover:bg-white/12 hover:text-[#c1c2c5] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={busy || !profile.trim()}
              className="flex-1 rounded-lg bg-blue-500 py-2 text-[12px] font-medium text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
    <div className="space-y-1.5">
      <label className="text-[11px] text-[#666] font-medium uppercase tracking-wide">
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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-[#666] font-medium uppercase tracking-wide">
          {label}
        </label>
        <span className="text-[11px] text-[#c1c2c5] font-mono">
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
        className="w-full h-1 rounded-full appearance-none bg-white/10 accent-blue-500 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-[#444]">
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
    <div className="flex rounded-lg bg-white/6 border border-white/8 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-all ${
            value === opt.value
              ? "bg-white/15 text-[#e0e0e0] shadow-sm"
              : "text-[#666] hover:text-[#909296]"
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
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? "bg-blue-500" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
