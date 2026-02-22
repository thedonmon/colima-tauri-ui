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

// Model registries supported by colima model run
const REGISTRY_PREFIXES = [
  { label: "HuggingFace (default)", value: "hf://", example: "hf://tinyllama" },
  { label: "Ollama", value: "ollama://", example: "ollama://tinyllama" },
  { label: "Bare name", value: "", example: "gemma3" },
];

const EXAMPLE_MODELS = ["gemma3", "hf://tinyllama", "ollama://tinyllama", "hf://phi-2"];

export function ModelSection() {
  const { instances } = useColimaStore();
  const runningInstances = instances.filter((i) => i.status.toLowerCase() === "running");

  const [open, setOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>("default");
  const [modelInput, setModelInput] = useState("");
  const [vmType, setVmType] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"setup" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    if (!open) {
      // Load vm types for running instances
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
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.04] overflow-hidden">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-[11px] hover:bg-white/4 transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#777]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <Cpu size={11} className="text-[#777]" />
          <span className="text-[#aaaaad] font-medium">AI Models</span>
          <span className="text-[10px] text-[#666] font-mono">colima model</span>
        </div>
        <span className="text-[10px] text-purple-400/70 bg-purple-500/10 rounded-full px-2 py-0.5">
          krunkit
        </span>
      </button>

      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg bg-purple-500/8 border border-purple-500/15 px-3 py-2.5">
            <AlertTriangle size={11} className="text-purple-400/80 mt-0.5 flex-shrink-0" />
            <p className="text-[10.5px] text-purple-300/70 leading-relaxed">
              Requires Apple Silicon + macOS 13+. Start Colima with{" "}
              <span className="font-mono text-purple-300/90">--vm-type krunkit</span> to enable GPU acceleration.
            </p>
          </div>

          {/* Profile selector */}
          {runningInstances.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#777]">Profile</span>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="flex-1 bg-white/6 border border-white/8 rounded-md px-2 py-1 text-[11px] text-[#c1c2c5] outline-none"
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
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isKrunkit ? "bg-green-500" : "bg-yellow-500/70"
                )}
              />
              <span className="text-[10.5px] text-[#888]">
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
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/5 py-2 text-[11px] text-[#aaaaad] hover:bg-white/8 hover:text-[#c1c2c5] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Settings size={11} className={cn(busy === "setup" && "animate-spin")} />
            {busy === "setup" ? "Setting up…" : "colima model setup"}
          </button>

          {/* Run model */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                placeholder="gemma3  ·  hf://tinyllama  ·  ollama://mistral"
                className="flex-1 bg-white/6 border border-white/8 rounded-md px-2.5 py-1.5 text-[11px] text-[#c1c2c5] placeholder:text-[#444] outline-none focus:border-purple-500/40 transition-colors"
              />
              <button
                onClick={handleRun}
                disabled={!modelInput.trim() || busy !== null || runningInstances.length === 0}
                className="flex items-center gap-1.5 rounded-md bg-purple-500/20 px-3 py-1.5 text-[11px] text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={10} />
                {busy === "run" ? "Running…" : "Run"}
              </button>
            </div>

            {/* Quick examples */}
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModelInput(m)}
                  className="text-[9.5px] font-mono rounded px-1.5 py-0.5 bg-white/5 text-[#666] hover:text-[#999] hover:bg-white/8 transition-all"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Registry guide */}
          <div className="rounded-lg bg-white/3 border border-white/6 px-3 py-2 space-y-1">
            <p className="text-[10px] text-[#666] font-medium mb-1.5">Supported registries</p>
            {REGISTRY_PREFIXES.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className="text-[9.5px] font-mono text-purple-400/70 w-20 flex-shrink-0">
                  {r.value || "bare"}
                </span>
                <span className="text-[9.5px] text-[#555]">{r.label}</span>
                <span className="text-[9.5px] font-mono text-[#444] ml-auto">{r.example}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-[10.5px] text-red-400/80 leading-snug">{error}</p>
          )}

          {/* No running instances */}
          {runningInstances.length === 0 && (
            <p className="text-[10.5px] text-[#666] italic">
              Start a Colima instance first to use AI models.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
