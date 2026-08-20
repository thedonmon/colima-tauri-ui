import { useState, useEffect } from "react";
import { invoke } from "../lib/tauri";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useColimaStore } from "../store";
import { ContainerRow } from "./ContainerRow";
import { cn } from "../lib/utils";
import type { DockerContainer, ContainerLogsTarget } from "../types";

interface DockerDesktopSectionProps {
  onContainerLogsOpen: (target: ContainerLogsTarget) => void;
  defaultOpen?: boolean;
  /** Global ⌘K search: filters the container list. */
  filter?: string;
}

export function DockerDesktopSection({ onContainerLogsOpen, defaultOpen, filter }: DockerDesktopSectionProps) {
  const dockerContexts = useColimaStore((s) => s.dockerContexts);
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [showStopped, setShowStopped] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(false);

  const query = (filter ?? "").trim().toLowerCase();
  const searching = query.length > 0;
  const isOpen = open || searching;

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
    if (isOpen && desktopCtx) fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, desktopCtx?.name, showStopped]);

  if (!desktopCtx) return null;

  const visibleContainers = searching
    ? containers.filter(
        (c) =>
          (c.names ?? "").toLowerCase().includes(query) ||
          (c.image ?? "").toLowerCase().includes(query)
      )
    : containers;

  const groups = new Map<string, DockerContainer[]>();
  const standalone: DockerContainer[] = [];
  for (const c of visibleContainers) {
    if (c.composeProject) {
      groups.set(c.composeProject, [...(groups.get(c.composeProject) ?? []), c]);
    } else {
      standalone.push(c);
    }
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="rounded-card border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 text-sm flex-1 min-w-0 text-left"
        >
          <div className="w-[34px] h-[34px] rounded-ctl bg-cyan-500/[0.14] text-cyan-300 flex items-center justify-center flex-shrink-0">
            <Layers size={17} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[15px] font-semibold text-fg leading-tight truncate">
              Docker Desktop
            </span>
            <span className="text-[11px] text-fg-muted font-mono leading-tight truncate">
              {desktopCtx.name}
            </span>
          </div>
          {containers.length > 0 && !isOpen && (
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-fg-muted">
              {containers.length}
            </span>
          )}
          <span className="text-fg-faint">
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </button>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowStopped((v) => !v)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full transition-all",
              showStopped
                ? "bg-white/[0.08] text-fg-muted"
                : "text-fg-faint hover:text-fg-muted"
            )}
          >
            {showStopped ? "All" : "Running"}
          </button>
          <span className="text-xs font-medium text-amber-300 bg-amber-500/[0.14] rounded-full px-2.5 py-1">
            external
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="px-3 pb-3 border-t border-border-subtle max-h-96 overflow-y-auto">
          {loading && visibleContainers.length === 0 ? (
            <p className="text-sm text-fg-muted pt-3">Loading...</p>
          ) : visibleContainers.length === 0 ? (
            <p className="text-sm text-fg-faint pt-3 italic">
              {searching ? "No matches" : showStopped ? "No containers" : "No running containers"}
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
