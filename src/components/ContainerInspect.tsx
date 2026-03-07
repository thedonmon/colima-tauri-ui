import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Copy, Check } from "lucide-react";

interface ContainerInspectProps {
  profile: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerInspect({
  profile,
  containerId,
  containerName,
  onClose,
}: ContainerInspectProps) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"env" | "ports" | "mounts" | "raw">("env");

  useEffect(() => {
    invoke("inspect_container", { profile, containerId })
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  }, [profile, containerId]);

  const handleCopy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Parse inspect data
  const inspect = Array.isArray(data) ? data[0] : data;
  const envVars: string[] = inspect?.Config?.Env ?? [];
  const ports = inspect?.NetworkSettings?.Ports ?? {};
  const mounts: Array<{ Source: string; Destination: string; Mode: string }> =
    inspect?.Mounts ?? [];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-panel rounded-2xl">
      <div className="h-9 flex-shrink-0" data-tauri-drag-region />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-fg">{containerName}</p>
          <p className="text-xs text-fg-muted font-mono">{containerId.slice(0, 12)}</p>
        </div>
        <div className="flex items-center gap-2">
          {data != null && (
            <button
              onClick={handleCopy}
              className="text-fg-faint hover:text-fg-secondary transition-colors"
              title="Copy raw JSON"
            >
              {copied ? (
                <Check size={15} className="text-green-400" />
              ) : (
                <Copy size={15} />
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-fg-faint hover:text-fg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3">
        {(["env", "ports", "mounts", "raw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === t
                ? "bg-white/[0.1] text-fg"
                : "text-fg-muted hover:text-fg-secondary hover:bg-white/[0.04]"
            }`}
          >
            {t === "env"
              ? `Env (${envVars.length})`
              : t === "ports"
              ? `Ports (${Object.keys(ports).length})`
              : t === "mounts"
              ? `Mounts (${mounts.length})`
              : "Raw JSON"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data ? (
          <p className="text-sm text-fg-faint">Loading...</p>
        ) : tab === "env" ? (
          <div className="space-y-1">
            {envVars.length === 0 ? (
              <p className="text-xs text-fg-muted italic">No environment variables</p>
            ) : (
              envVars.map((env, i) => {
                const eqIdx = env.indexOf("=");
                const key = eqIdx >= 0 ? env.slice(0, eqIdx) : env;
                const val = eqIdx >= 0 ? env.slice(eqIdx + 1) : "";
                return (
                  <div key={i} className="flex gap-2 text-xs font-mono py-1 rounded hover:bg-white/[0.03]">
                    <span className="text-blue-400 flex-shrink-0">{key}</span>
                    <span className="text-fg-faint">=</span>
                    <span className="text-fg-secondary break-all">{val}</span>
                  </div>
                );
              })
            )}
          </div>
        ) : tab === "ports" ? (
          <div className="space-y-1">
            {Object.keys(ports).length === 0 ? (
              <p className="text-xs text-fg-muted italic">No ports exposed</p>
            ) : (
              Object.entries(ports).map(([containerPort, bindings]) => (
                <div key={containerPort} className="flex gap-3 text-xs font-mono py-1">
                  <span className="text-fg-secondary">{containerPort}</span>
                  <span className="text-fg-faint">→</span>
                  <span className="text-green-400">
                    {Array.isArray(bindings) && bindings.length > 0
                      ? bindings
                          .map(
                            (b: { HostIp?: string; HostPort?: string }) =>
                              `${b.HostIp || "0.0.0.0"}:${b.HostPort}`
                          )
                          .join(", ")
                      : "not bound"}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : tab === "mounts" ? (
          <div className="space-y-2">
            {mounts.length === 0 ? (
              <p className="text-xs text-fg-muted italic">No mounts</p>
            ) : (
              mounts.map((m, i) => (
                <div key={i} className="text-xs font-mono py-1 space-y-0.5">
                  <div className="flex gap-2">
                    <span className="text-fg-faint">src:</span>
                    <span className="text-fg-secondary break-all">{m.Source}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-fg-faint">dst:</span>
                    <span className="text-fg-secondary break-all">{m.Destination}</span>
                  </div>
                  {m.Mode && (
                    <span className="text-fg-faint">({m.Mode})</span>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <pre className="text-xs text-fg-secondary font-mono leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(inspect, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
