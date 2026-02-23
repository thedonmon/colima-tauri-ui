import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useColimaStore } from "../store";
import { ContainerRow } from "./ContainerRow";
import { cn } from "../lib/utils";
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
  const [showStopped, setShowStopped] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(false);

  // Find any non-colima contexts that look like Docker Desktop
  const desktopCtx = dockerContexts.find(
    (c) => c.name === "desktop-linux" || c.name.startsWith("desktop-")
  );

  const fetchContainers = () => {
    if (!desktopCtx) return;
    setLoading(true);
    invoke<DockerContainer[]>("get_containers_by_context", { context: desktopCtx.name, showAll: showStopped })
      .then(setContainers)
      .catch(() => setContainers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && desktopCtx) fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, desktopCtx?.name, showStopped]);

  if (!desktopCtx) return null;

  // Compute groupings
  const groups = new Map<string, DockerContainer[]>();
  const standalone: DockerContainer[] = [];
  for (const c of containers) {
    if (c.composeProject) {
      groups.set(c.composeProject, [...(groups.get(c.composeProject) ?? []), c]);
    } else {
      standalone.push(c);
    }
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.04] overflow-hidden">
      <div className="flex items-center px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-[11px] hover:bg-white/4 transition-all flex-1"
        >
          <span className="text-[#555]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <span className="text-[#aaaaad] font-medium">Docker Desktop</span>
          <span className="text-[10px] text-[#777] font-mono">{desktopCtx.name}</span>
          {containers.length > 0 && !open && (
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-[#555]">
              {containers.length}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStopped((v) => !v)}
            className={cn(
              "text-[9.5px] px-1.5 py-0.5 rounded transition-all",
              showStopped
                ? "bg-white/[0.08] text-[#888]"
                : "text-[#555] hover:text-[#777]"
            )}
          >
            {showStopped ? "All" : "Running"}
          </button>
          <span className="text-[10px] text-yellow-400/80 bg-yellow-500/10 rounded-full px-2 py-0.5">
            external
          </span>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-white/6">
          {loading && containers.length === 0 ? (
            <p className="text-[11px] text-[#666] pt-3">Loading…</p>
          ) : containers.length === 0 ? (
            <p className="text-[11px] text-[#3a3a3a] pt-3 italic">
              {showStopped ? "No containers" : "No running containers"}
            </p>
          ) : (
            <div className="pt-3 space-y-3">
              {sortedGroups.map(([project, members]) => {
                const isOpen = openGroups[project] ?? true;
                return (
                  <div key={project}>
                    <button
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [project]: !isOpen }))
                      }
                      className="flex items-center gap-1 text-[9.5px] text-[#666] hover:text-[#999] w-full mb-1 transition-all"
                    >
                      {isOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                      <span className="font-medium">{project}</span>
                      <span className="ml-auto text-[#555]">{members.length}</span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 ml-3">
                        {members.map((c) => (
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
                );
              })}
              {standalone.map((c) => (
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
