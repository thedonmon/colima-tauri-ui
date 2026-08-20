import { useCallback, useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useColimaStore } from "../store";
import type { StaleProcess } from "../types";

interface StaleProcessBannerProps {
  /// Profile used to label the cleanup's log output.
  profile: string;
  onViewLogs: () => void;
}

/**
 * Surfaces leftovers from an unclean shutdown *before* a start is attempted.
 *
 * The old recovery affordance only appeared after a command had already failed
 * with one of six hardcoded error strings — so the common case (crash, Colima
 * shows as stopped, Start hangs on a socket an orphan still holds) never
 * revealed it. This checks up front instead.
 *
 * The backing scan reports nothing while any instance is up, so this banner is
 * only ever visible when everything is stopped and cleanup is safe.
 */
export function StaleProcessBanner({ profile, onViewLogs }: StaleProcessBannerProps) {
  const { killStaleProcesses, isRunningCommand } = useColimaStore(
    useShallow((s) => ({ killStaleProcesses: s.killStaleProcesses, isRunningCommand: s.isRunningCommand }))
  );
  const [stale, setStale] = useState<StaleProcess[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const scan = useCallback(() => {
    invoke<StaleProcess[]>("scan_stale_processes")
      .then(setStale)
      .catch(() => setStale([]));
  }, []);

  // Re-scan whenever a command finishes, since starting or stopping an instance
  // is exactly what creates or clears these.
  useEffect(() => {
    if (!isRunningCommand) scan();
  }, [isRunningCommand, scan]);

  if (stale.length === 0) return null;

  const handleCleanup = async () => {
    setCleaning(true);
    onViewLogs();
    try {
      await killStaleProcesses(profile);
    } catch {
      // surfaced in the log drawer
    } finally {
      setCleaning(false);
      scan();
    }
  };

  return (
    <div className="rounded-card border border-amber-500/25 bg-amber-500/[0.07] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle size={15} className="text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-300/90 font-medium">
            {stale.length} leftover {stale.length === 1 ? "process" : "processes"} from an unclean shutdown
          </p>
          <p className="text-xs text-amber-300/60">
            Colima is stopped but these are still running. They hold its network
            sockets, which is what makes Start hang.
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-amber-300/70 hover:text-amber-300 transition-colors shrink-0"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Details
        </button>
        <button
          onClick={handleCleanup}
          disabled={cleaning || isRunningCommand}
          className="text-xs px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {cleaning ? "Cleaning..." : "Clean up"}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-1 border-t border-amber-500/15 pt-2">
          {stale.map((s) => (
            <div key={s.pid} className="flex items-baseline gap-2 text-xs font-mono">
              <span className="text-amber-300/80">{s.kind}</span>
              <span className="text-fg-faint">pid {s.pid}</span>
              <span className="text-fg-muted truncate">— {s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
