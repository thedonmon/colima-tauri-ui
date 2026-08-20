import { useCallback, useState } from "react";
import { invoke } from "../lib/tauri";
import { useAdaptivePoll } from "../lib/usePolling";
import type { ContainerStats } from "../types";

interface ContainerStatsRowProps {
  profile: string;
}

export function ContainerStatsPanel({ profile }: ContainerStatsRowProps) {
  const [stats, setStats] = useState<ContainerStats[]>([]);
  const [loading, setLoading] = useState(true);

  // `docker stats` is by far the most expensive thing this app asks of the VM:
  // about a second of guest CPU per call, hence the unhurried default interval.
  const poll = useCallback(async () => {
    try {
      setStats(await invoke<ContainerStats[]>("get_container_stats", { profile }));
    } catch {
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useAdaptivePoll(poll);

  if (loading && stats.length === 0) return null;
  if (stats.length === 0) return null;

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_60px_90px_80px] gap-2 px-1 text-xs text-fg-faint font-medium">
        <span>Name</span>
        <span className="text-right">CPU</span>
        <span className="text-right">Memory</span>
        <span className="text-right">Net I/O</span>
      </div>
      {stats.map((s) => (
        <div
          key={s.id}
          className="grid grid-cols-[1fr_60px_90px_80px] gap-2 px-1 py-1 text-xs text-fg-muted font-mono rounded hover:bg-surface"
        >
          <span className="truncate text-fg-secondary">{s.name}</span>
          <span className="text-right">{s.cpuPercent}</span>
          <span className="text-right">{s.memoryUsage}</span>
          <span className="text-right">{s.netIo}</span>
        </div>
      ))}
    </div>
  );
}
