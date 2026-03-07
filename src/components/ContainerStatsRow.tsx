import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ContainerStats } from "../types";

interface ContainerStatsRowProps {
  profile: string;
}

export function ContainerStatsPanel({ profile }: ContainerStatsRowProps) {
  const [stats, setStats] = useState<ContainerStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const s = await invoke<ContainerStats[]>("get_container_stats", { profile });
        if (!cancelled) setStats(s);
      } catch {
        if (!cancelled) setStats([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

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
          className="grid grid-cols-[1fr_60px_90px_80px] gap-2 px-1 py-1 text-xs text-fg-muted font-mono rounded hover:bg-white/[0.03]"
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
