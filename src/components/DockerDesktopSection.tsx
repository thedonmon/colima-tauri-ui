import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useColimaStore } from "../store";
import { ContainerRow } from "./ContainerRow";
import type { DockerContainer, ContainerLogsTarget } from "../types";

interface DockerDesktopSectionProps {
  onContainerLogsOpen: (target: ContainerLogsTarget) => void;
  defaultOpen?: boolean;
}

/**
 * Shows containers running in non-Colima Docker contexts (e.g. Docker Desktop).
 * Only renders if a "desktop-linux" or similar non-colima context is found.
 */
export function DockerDesktopSection({ onContainerLogsOpen, defaultOpen }: DockerDesktopSectionProps) {
  const { dockerContexts } = useColimaStore();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(false);

  // Find any non-colima contexts that look like Docker Desktop
  const desktopCtx = dockerContexts.find(
    (c) => c.name === "desktop-linux" || c.name.startsWith("desktop-")
  );

  const fetchContainers = () => {
    if (!desktopCtx) return;
    setLoading(true);
    invoke<DockerContainer[]>("get_containers_by_context", { context: desktopCtx.name })
      .then(setContainers)
      .catch(() => setContainers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && desktopCtx) fetchContainers();
  }, [open, desktopCtx?.name]);

  if (!desktopCtx) return null;

  return (
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-[11px] hover:bg-white/4 transition-all"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#555]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <span className="text-[#aaaaad] font-medium">Docker Desktop</span>
          <span className="text-[10px] text-[#777] font-mono">{desktopCtx.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {containers.length > 0 && !open && (
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-[#555]">
              {containers.length}
            </span>
          )}
          <span className="text-[10px] text-yellow-400/80 bg-yellow-500/10 rounded-full px-2 py-0.5">
            external
          </span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/6">
          {loading ? (
            <p className="text-[11px] text-[#444] pt-3">Loading…</p>
          ) : containers.length === 0 ? (
            <p className="text-[11px] text-[#3a3a3a] pt-3 italic">No running containers</p>
          ) : (
            <div className="pt-3 space-y-3">
              {containers.map((c) => (
                <ContainerRow
                  key={c.id}
                  container={c}
                  context={desktopCtx.name}
                  onLogsOpen={onContainerLogsOpen}
                  onRefresh={fetchContainers}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
