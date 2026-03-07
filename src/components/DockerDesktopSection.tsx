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

export function DockerDesktopSection({ onContainerLogsOpen, defaultOpen }: DockerDesktopSectionProps) {
  const { dockerContexts } = useColimaStore();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [showStopped, setShowStopped] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(false);

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
    <div className="rounded-xl border border-border bg-white/[0.03] overflow-hidden">
      <div className="flex items-center px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 text-sm hover:bg-white/[0.03] transition-all flex-1"
        >
          <span className="text-fg-faint">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="text-fg-secondary font-medium">Docker Desktop</span>
          <span className="text-xs text-fg-muted font-mono">{desktopCtx.name}</span>
          {containers.length > 0 && !open && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-fg-faint">
              {containers.length}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowStopped((v) => !v)}
            className={cn(
              "text-xs px-2 py-1 rounded-md transition-all",
              showStopped
                ? "bg-white/[0.08] text-fg-muted"
                : "text-fg-faint hover:text-fg-muted"
            )}
          >
            {showStopped ? "All" : "Running"}
          </button>
          <span className="text-xs text-yellow-400/80 bg-yellow-500/10 rounded-full px-2.5 py-1">
            external
          </span>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border-subtle">
          {loading && containers.length === 0 ? (
            <p className="text-sm text-fg-muted pt-3">Loading...</p>
          ) : containers.length === 0 ? (
            <p className="text-sm text-fg-faint pt-3 italic">
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
                      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-secondary w-full mb-1.5 transition-all"
                    >
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <span className="font-medium">{project}</span>
                      <span className="ml-auto text-fg-faint">{members.length}</span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2.5 ml-3">
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
