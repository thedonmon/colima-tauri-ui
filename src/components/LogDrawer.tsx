import { useEffect, useRef, useMemo, useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { useColimaStore } from "../store";
import { cn } from "../lib/utils";

interface LogDrawerProps {
  onClose: () => void;
}

/** Patterns that indicate a stuck/crashed VM state. */
const STUCK_VM_PATTERNS = [
  "in use by instance",
  "failed to run attach disk",
  "lock file already locked",
  "instance is already running",
  "refused",
  "broken",
];

function detectStuckVM(logs: { line: string; isError: boolean }[]): boolean {
  const text = logs
    .filter((l) => l.isError)
    .map((l) => l.line.toLowerCase())
    .join("\n");
  return STUCK_VM_PATTERNS.some((p) => text.includes(p));
}

export function LogDrawer({ onClose }: LogDrawerProps) {
  const {
    logs,
    isRunningCommand,
    lastCommandFailed,
    activeProfile,
    forceStopInstance,
    killStaleProcesses,
    fetchInstances,
  } = useColimaStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [recovering, setRecovering] = useState(false);
  // Remember the profile that failed so we can offer recovery even after activeProfile clears
  const failedProfileRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeProfile) failedProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const isStuck = useMemo(
    () => !isRunningCommand && lastCommandFailed && detectStuckVM(logs),
    [isRunningCommand, lastCommandFailed, logs]
  );

  const profile = activeProfile ?? failedProfileRef.current;

  const handleForceStop = async () => {
    if (!profile) return;
    setRecovering(true);
    try {
      await forceStopInstance(profile);
    } catch {
      // logged to output
    } finally {
      setRecovering(false);
      fetchInstances();
    }
  };

  const handleKillAndRecover = async () => {
    if (!profile) return;
    setRecovering(true);
    try {
      await killStaleProcesses(profile);
      await forceStopInstance(profile);
    } catch {
      // logged to output
    } finally {
      setRecovering(false);
      fetchInstances();
    }
  };

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ height: 200 }}>
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">
            Output
          </span>
          {isRunningCommand && (
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-fg-faint hover:text-fg-muted transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Recovery banner */}
      {isStuck && profile && !recovering && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300/90 flex-1">
            VM appears stuck from a previous crash.
          </span>
          <button
            onClick={handleForceStop}
            className="text-xs px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all font-medium"
          >
            Force Stop
          </button>
          <button
            onClick={handleKillAndRecover}
            className="text-xs px-2.5 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all font-medium"
          >
            Kill Processes
          </button>
        </div>
      )}

      {recovering && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/[0.06] border-b border-blue-500/20">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-400/80">Recovering...</span>
        </div>
      )}

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-xs">
        {logs.length === 0 ? (
          <span className="text-fg-muted">Waiting for output...</span>
        ) : (
          logs.map((log, i) => {
            const isActualError = log.isError && /level=(error|fatal|warn)|error:|failed|panic/i.test(log.line);
            return (
              <div
                key={i}
                className={cn(
                  "leading-relaxed whitespace-pre-wrap break-all",
                  isActualError ? "text-red-400/80" : "text-fg-secondary"
                )}
              >
                {log.line}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
