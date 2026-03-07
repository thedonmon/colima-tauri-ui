import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Play,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useColimaStore } from "../store";

const REGISTRY_PREFIXES = [
  { label: "HuggingFace (default)", value: "hf://", example: "hf://tinyllama" },
  { label: "Ollama", value: "ollama://", example: "ollama://tinyllama" },
  { label: "Bare name", value: "", example: "gemma3" },
];

const EXAMPLE_MODELS = ["gemma3", "hf://tinyllama", "ollama://tinyllama", "hf://phi-2"];

interface ModelSectionProps {
  defaultOpen?: boolean;
  onViewLogs?: () => void;
}

export function ModelSection({ defaultOpen, onViewLogs }: ModelSectionProps = {}) {
  const { instances } = useColimaStore();
  const runningInstances = instances.filter((i) => i.status.toLowerCase() === "running");

  const [open, setOpen] = useState(defaultOpen ?? false);
  const [selectedProfile, setSelectedProfile] = useState<string>("default");
  const [modelInput, setModelInput] = useState("");
  const [vmType, setVmType] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"setup" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    if (!open) {
      const types: Record<string, string> = {};
      await Promise.all(
        runningInstances.map(async (inst) => {
          try {
            const t = await invoke<string>("get_vm_type", { profile: inst.profile });
            types[inst.profile] = t;
          } catch {
            types[inst.profile] = "";
          }
        })
      );
      setVmType(types);
      if (runningInstances.length > 0) setSelectedProfile(runningInstances[0].profile);
    }
    setOpen((v) => !v);
  };

  const isKrunkit = vmType[selectedProfile] === "krunkit";

  const handleSetup = async () => {
    onViewLogs?.();
    setBusy("setup");
    setError(null);
    try {
      await invoke("colima_model_setup", { profile: selectedProfile });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleRun = async () => {
    const model = modelInput.trim();
    if (!model) return;
    onViewLogs?.();
    setBusy("run");
    setError(null);
    try {
      await invoke("colima_model_run", { profile: selectedProfile, model });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white/[0.03] overflow-hidden">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.03] transition-all"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-fg-muted">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <Cpu size={13} className="text-fg-muted" />
          <span className="text-fg-secondary font-medium">AI Models</span>
          <span className="text-xs text-fg-muted font-mono">colima model</span>
        </div>
        <span className="text-xs text-purple-400/70 bg-purple-500/10 rounded-full px-2.5 py-1">
          krunkit
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3 space-y-3">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-lg bg-purple-500/[0.06] border border-purple-500/15 px-3.5 py-3">
            <AlertTriangle size={13} className="text-purple-400/80 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-300/70 leading-relaxed">
              Requires Apple Silicon + macOS 13+. "Setup" will start a{" "}
              <span className="font-mono text-purple-300/90">krunkit</span> instance then run{" "}
              <span className="font-mono text-purple-300/90">colima model setup</span> automatically.
            </p>
          </div>

          {/* Profile selector */}
          {runningInstances.length > 1 && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-fg-muted">Profile</span>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="flex-1 bg-white/[0.04] border border-border rounded-lg px-2.5 py-1.5 text-sm text-fg outline-none"
              >
                {runningInstances.map((i) => (
                  <option key={i.profile} value={i.profile}>
                    {i.profile}
                    {vmType[i.profile] ? ` (${vmType[i.profile]})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* krunkit status */}
          {runningInstances.length > 0 && (
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isKrunkit ? "bg-green-500" : "bg-yellow-500/70"
                )}
              />
              <span className="text-xs text-fg-muted">
                {isKrunkit
                  ? "krunkit detected — GPU acceleration available"
                  : `VM type: ${vmType[selectedProfile] || "qemu/vz"} — restart with krunkit for GPU`}
              </span>
            </div>
          )}

          {/* Setup button */}
          <button
            onClick={handleSetup}
            disabled={busy !== null || runningInstances.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] py-2.5 text-sm text-fg-secondary hover:bg-white/[0.06] hover:text-fg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Settings size={13} className={cn(busy === "setup" && "animate-spin")} />
            {busy === "setup" ? "Setting up..." : "colima model setup"}
          </button>

          {/* Run model */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                placeholder="gemma3  ·  hf://tinyllama  ·  ollama://mistral"
                className="flex-1 bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-purple-500/40 transition-colors"
              />
              <button
                onClick={handleRun}
                disabled={!modelInput.trim() || busy !== null || runningInstances.length === 0}
                className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-3.5 py-2 text-sm text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={12} />
                {busy === "run" ? "Running..." : "Run"}
              </button>
            </div>

            {/* Quick examples */}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModelInput(m)}
                  className="text-xs font-mono rounded-md px-2 py-1 bg-white/[0.04] text-fg-muted hover:text-fg-secondary hover:bg-white/[0.07] transition-all"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Registry guide */}
          <div className="rounded-lg bg-white/[0.02] border border-border-subtle px-3.5 py-2.5 space-y-1.5">
            <p className="text-xs text-fg-muted font-medium mb-2">Supported registries</p>
            {REGISTRY_PREFIXES.map((r) => (
              <div key={r.label} className="flex items-center gap-2.5">
                <span className="text-xs font-mono text-purple-400/70 w-20 flex-shrink-0">
                  {r.value || "bare"}
                </span>
                <span className="text-xs text-fg-muted">{r.label}</span>
                <span className="text-xs font-mono text-fg-faint ml-auto">{r.example}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400/80 leading-snug">{error}</p>
          )}

          {/* No running instances */}
          {runningInstances.length === 0 && (
            <p className="text-xs text-fg-muted italic">
              Start a Colima instance first to use AI models.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
