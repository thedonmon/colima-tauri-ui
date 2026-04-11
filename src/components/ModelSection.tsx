import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  List,
  Play,
  Settings,
  Square,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useColimaStore } from "../store";

const CHAT_MODELS = [
  "gemma3",
  "hf://tinyllama",
  "ollama://tinyllama",
  "hf://phi-2",
  "ollama://mistral",
];

const EMBEDDING_MODELS = [
  "ollama://nomic-embed-text",
  "ollama://all-minilm",
  "ollama://mxbai-embed-large",
];

interface ModelSectionProps {
  defaultOpen?: boolean;
  onViewLogs?: () => void;
}

type BusyState = "setup" | "run" | "pull" | null;

/** Parse "colima version X.Y.Z" and return true if >= 0.10.1 (Docker Model Runner support) */
function hasDockerRunner(versionStr: string): boolean {
  const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 0 || minor > 10 || (minor === 10 && patch >= 1);
}

export function ModelSection({ defaultOpen, onViewLogs }: ModelSectionProps = {}) {
  const { instances, version } = useColimaStore();
  const runningInstances = instances.filter((i) => i.status.toLowerCase() === "running");
  const supportsDockerRunner = hasDockerRunner(version);

  const [open, setOpen] = useState(defaultOpen ?? false);
  const [selectedProfile, setSelectedProfile] = useState<string>("default");
  const [modelInput, setModelInput] = useState("");
  const [vmType, setVmType] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<BusyState>(null);
  const [serving, setServing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [modelList, setModelList] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [tab, setTab] = useState<"run" | "serve">("run");

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
  const isServing = !!serving[selectedProfile];
  const canRunModels = supportsDockerRunner || isKrunkit;

  const handleSetup = async () => {
    onViewLogs?.();
    setBusy("setup");
    setError(null);
    try {
      await invoke("colima_model_setup", { profile: selectedProfile, skipKrunkit: supportsDockerRunner });
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

  const handleServe = async () => {
    const model = modelInput.trim();
    if (!model) return;
    onViewLogs?.();
    setError(null);
    try {
      await invoke("colima_model_serve", {
        profile: selectedProfile,
        model,
        port: null,
      });
      setServing((prev) => ({ ...prev, [selectedProfile]: model }));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStopServe = async () => {
    setError(null);
    try {
      await invoke("colima_model_stop_serve", { profile: selectedProfile });
      setServing((prev) => {
        const next = { ...prev };
        delete next[selectedProfile];
        return next;
      });
    } catch (e) {
      setError(String(e));
    }
  };

  const handlePull = async () => {
    const model = modelInput.trim();
    if (!model) return;
    onViewLogs?.();
    setBusy("pull");
    setError(null);
    try {
      await invoke("colima_model_pull", { profile: selectedProfile, model });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleList = useCallback(async () => {
    setError(null);
    try {
      const result = await invoke<string>("colima_model_list", { profile: selectedProfile });
      setModelList(result);
      setShowList(true);
    } catch (e) {
      setError(String(e));
    }
  }, [selectedProfile]);

  const examples = tab === "serve" ? EMBEDDING_MODELS : CHAT_MODELS;

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
          {supportsDockerRunner ? "docker" : "krunkit"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3 space-y-3">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-lg bg-purple-500/[0.06] border border-purple-500/15 px-3.5 py-3">
            <AlertTriangle size={13} className="text-purple-400/80 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-300/70 leading-relaxed">
              {supportsDockerRunner ? (
                <>
                  Using <span className="font-mono text-purple-300/90">Docker Model Runner</span> (colima 0.10.1+).
                  No krunkit required — works with any VM type.
                </>
              ) : (
                <>
                  Requires Apple Silicon + macOS 13+. "Setup" will start a{" "}
                  <span className="font-mono text-purple-300/90">krunkit</span> instance then run{" "}
                  <span className="font-mono text-purple-300/90">colima model setup</span> automatically.
                  <span className="block mt-1 text-purple-300/50">
                    Upgrade to colima 0.10.1+ for Docker Model Runner (no krunkit needed).
                  </span>
                </>
              )}
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

          {/* Runner status */}
          {runningInstances.length > 0 && (
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  supportsDockerRunner || isKrunkit ? "bg-green-500" : "bg-yellow-500/70"
                )}
              />
              <span className="text-xs text-fg-muted">
                {supportsDockerRunner
                  ? "Docker Model Runner ready"
                  : isKrunkit
                    ? "krunkit detected — GPU acceleration available"
                    : `VM type: ${vmType[selectedProfile] || "qemu/vz"} — restart with krunkit for GPU`}
              </span>
            </div>
          )}

          {/* Setup + List buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSetup}
              disabled={busy !== null || runningInstances.length === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] py-2.5 text-sm text-fg-secondary hover:bg-white/[0.06] hover:text-fg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Settings size={13} className={cn(busy === "setup" && "animate-spin")} />
              {busy === "setup" ? "Setting up..." : "Setup"}
            </button>
            <button
              onClick={handleList}
              disabled={busy !== null || runningInstances.length === 0 || !canRunModels}
              className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3.5 py-2.5 text-sm text-fg-secondary hover:bg-white/[0.06] hover:text-fg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <List size={13} />
              Models
            </button>
          </div>

          {/* Serving indicator */}
          {isServing && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <Radio size={13} className="text-emerald-400 animate-pulse" />
                <div>
                  <p className="text-xs text-emerald-400 font-medium">
                    Serving: {serving[selectedProfile]}
                  </p>
                  <p className="text-xs text-emerald-400/60">
                    OpenAI-compatible API running
                  </p>
                </div>
              </div>
              <button
                onClick={handleStopServe}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/25 transition-all"
              >
                <Square size={10} />
                Stop
              </button>
            </div>
          )}

          {/* Run / Serve tab toggle */}
          <div className="flex rounded-lg bg-white/[0.04] border border-border p-0.5">
            <button
              onClick={() => setTab("run")}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                tab === "run"
                  ? "bg-purple-500/20 text-purple-300 shadow-sm"
                  : "text-fg-muted hover:text-fg-secondary"
              )}
            >
              Run (Interactive)
            </button>
            <button
              onClick={() => setTab("serve")}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                tab === "serve"
                  ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
                  : "text-fg-muted hover:text-fg-secondary"
              )}
            >
              Serve (API)
            </button>
          </div>

          {/* Model input + action buttons */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (tab === "run") handleRun();
                    else handleServe();
                  }
                }}
                placeholder={
                  tab === "serve"
                    ? "ollama://nomic-embed-text  ·  gemma3"
                    : "gemma3  ·  hf://tinyllama  ·  ollama://mistral"
                }
                className="flex-1 bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-purple-500/40 transition-colors"
              />
              {tab === "run" ? (
                <button
                  onClick={handleRun}
                  disabled={!modelInput.trim() || busy !== null || runningInstances.length === 0 || !canRunModels}
                  className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-3.5 py-2 text-sm text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play size={12} />
                  {busy === "run" ? "Running..." : "Run"}
                </button>
              ) : (
                <button
                  onClick={handleServe}
                  disabled={!modelInput.trim() || busy !== null || isServing || runningInstances.length === 0 || !canRunModels}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3.5 py-2 text-sm text-emerald-300 hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Radio size={12} />
                  Serve
                </button>
              )}
            </div>

            {/* Pull button */}
            <button
              onClick={handlePull}
              disabled={!modelInput.trim() || busy !== null || runningInstances.length === 0 || !canRunModels}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] py-2 text-xs text-fg-muted hover:bg-white/[0.06] hover:text-fg-secondary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={11} />
              {busy === "pull" ? "Pulling..." : "Pull model (download only)"}
            </button>

            {/* Quick examples */}
            <div>
              <p className="text-xs text-fg-faint mb-1.5">
                {tab === "serve" ? "Embedding models" : "Chat models"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((m) => (
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
          </div>

          {/* Model list */}
          {showList && modelList !== null && (
            <div className="rounded-lg bg-white/[0.02] border border-border-subtle overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-border-subtle">
                <p className="text-xs text-fg-muted font-medium">Downloaded Models</p>
                <button
                  onClick={() => setShowList(false)}
                  className="text-xs text-fg-faint hover:text-fg-muted transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="px-3.5 py-2.5 max-h-40 overflow-y-auto">
                {modelList.trim() ? (
                  <pre className="text-xs text-fg-secondary font-mono whitespace-pre-wrap leading-relaxed">
                    {modelList}
                  </pre>
                ) : (
                  <p className="text-xs text-fg-muted italic">No models downloaded yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Registry guide */}
          <details className="group">
            <summary className="text-xs text-fg-faint cursor-pointer hover:text-fg-muted transition-colors list-none flex items-center gap-1.5">
              <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
              Supported registries
            </summary>
            <div className="rounded-lg bg-white/[0.02] border border-border-subtle px-3.5 py-2.5 space-y-1.5 mt-2">
              {[
                { label: "HuggingFace (default)", value: "hf://", example: "hf://tinyllama" },
                { label: "Ollama", value: "ollama://", example: "ollama://tinyllama" },
                { label: "Bare name", value: "", example: "gemma3" },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-2.5">
                  <span className="text-xs font-mono text-purple-400/70 w-20 flex-shrink-0">
                    {r.value || "bare"}
                  </span>
                  <span className="text-xs text-fg-muted">{r.label}</span>
                  <span className="text-xs font-mono text-fg-faint ml-auto">{r.example}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400/80 leading-snug">{error}</p>
          )}

          {/* Guidance messages */}
          {runningInstances.length === 0 && (
            <p className="text-xs text-fg-muted italic">
              Start a Colima instance first to use AI models.
            </p>
          )}
          {runningInstances.length > 0 && !canRunModels && (
            <p className="text-xs text-yellow-400/70 italic">
              Upgrade to colima 0.10.1+ (<span className="font-mono">brew upgrade colima</span>) or restart with <span className="font-mono">--vm-type krunkit</span> to enable AI models.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
