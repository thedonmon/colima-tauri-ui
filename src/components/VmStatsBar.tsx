import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive } from "lucide-react";
import { useAdaptivePoll } from "../lib/usePolling";
import { Sparkline } from "./ui/Sparkline";
import type { VmStats } from "../types";

/** ~5 minutes of history at the 10s poll interval. */
const MAX_POINTS = 30;

/** "12.5%" → 12.5; anything unparsable → null. */
function parsePercent(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** "1.9GiB" / "512MiB" / "1.2G" → GiB; anything unparsable → null. */
function parseGiB(s: string): number | null {
  const m = s.match(/([\d.]+)\s*([KMGT])?i?B?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "G").toUpperCase();
  const factor = unit === "K" ? 1 / (1024 * 1024) : unit === "M" ? 1 / 1024 : unit === "T" ? 1024 : 1;
  return n * factor;
}

interface VmStatsBarProps {
  profile: string;
}

export function VmStatsBar({ profile }: VmStatsBarProps) {
  const [stats, setStats] = useState<VmStats | null>(null);
  const cpuHist = useRef<number[]>([]);
  const memHist = useRef<number[]>([]);

  // Each call is a `colima status` plus two `colima ssh` sessions into the guest.
  const poll = useCallback(async () => {
    try {
      const next = await invoke<VmStats>("get_vm_stats", { profile });
      const cpu = parsePercent(next.cpuUsage);
      if (cpu !== null) cpuHist.current = [...cpuHist.current.slice(-(MAX_POINTS - 1)), cpu];
      const mem = parseGiB(next.memoryUsed);
      if (mem !== null) memHist.current = [...memHist.current.slice(-(MAX_POINTS - 1)), mem];
      setStats(next);
    } catch {
      setStats(null);
    }
  }, [profile]);

  useAdaptivePoll(poll);

  if (!stats) return null;

  const memTotal = parseGiB(stats.memoryTotal);
  // Scale CPU to recent activity (with a 20% floor) — a fixed 0–100 scale
  // renders typical idle loads as a flat line on the baseline.
  const cpuMax = Math.max(20, ...cpuHist.current) * 1.25;

  return (
    <div className="border-t border-border-subtle px-4 py-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <MetricSpark
          label="CPU"
          value={stats.cpuUsage}
          data={cpuHist.current}
          max={cpuMax}
        />
        <MetricSpark
          label="Memory"
          value={`${stats.memoryUsed} / ${stats.memoryTotal}`}
          data={memHist.current}
          max={memTotal ?? undefined}
        />
      </div>
      <span className="flex items-center gap-1.5 text-xs text-fg-muted font-mono">
        <HardDrive size={11} className="text-icon" />
        disk {stats.diskUsed} / {stats.diskTotal}
      </span>
    </div>
  );
}

function MetricSpark({
  label,
  value,
  data,
  max,
}: {
  label: string;
  value: string;
  data: number[];
  max?: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-faint">
          {label}
        </span>
        <span className="text-xs text-fg-secondary font-mono truncate">{value}</span>
      </div>
      <Sparkline values={data} max={max} className="text-blue-400" />
    </div>
  );
}
