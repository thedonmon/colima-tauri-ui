import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";
import type { VmStats } from "../types";

interface VmStatsBarProps {
  profile: string;
}

export function VmStatsBar({ profile }: VmStatsBarProps) {
  const [stats, setStats] = useState<VmStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const s = await invoke<VmStats>("get_vm_stats", { profile });
        if (!cancelled) setStats(s);
      } catch {
        if (!cancelled) setStats(null);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border-subtle">
      <StatPill icon={<Cpu size={11} />} label={stats.cpuUsage} />
      <StatPill
        icon={<MemoryStick size={11} />}
        label={`${stats.memoryUsed} / ${stats.memoryTotal}`}
      />
      <StatPill
        icon={<HardDrive size={11} />}
        label={`${stats.diskUsed} / ${stats.diskTotal}`}
      />
    </div>
  );
}

function StatPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-muted font-mono">
      <span className="text-icon">{icon}</span>
      {label}
    </span>
  );
}
