import { useState, useEffect, useRef } from "react";
import { invoke } from "../lib/tauri";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Play,
  Server,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Scissors,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useColimaStore } from "../store";
import { useSettingsStore } from "../store/settings";
import { StatusBadge } from "./StatusBadge";
import { PruneConfirmModal } from "./PruneConfirmModal";
import { ContainerRow } from "./ContainerRow";
import { ImageRow } from "./ImageRow";
import { VolumeRow } from "./VolumeRow";
import { VmStatsBar } from "./VmStatsBar";
import { ContainerStatsPanel } from "./ContainerStatsRow";
import { ImagePull } from "./ImagePull";
import { Button, IconButton } from "./ui/Button";
import { DEMO_MODE } from "../lib/demo";
import { CountPill } from "./ui/Badge";
import { cn } from "../lib/utils";
import type { ColimaInstance, DockerContainer, DockerImage, DockerVolume, ContainerLogsTarget } from "../types";

interface InstanceCardProps {
  instance: ColimaInstance;
  onStart: (profile: string) => void;
  onViewConfig: (profile: string) => void;
  onViewLogs: () => void;
  onContainerLogsOpen: (target: ContainerLogsTarget) => void;
  onInspectContainer: (profile: string, containerId: string, containerName: string) => void;
  /** Global ⌘K search: filters containers, images, and volumes. */
  filter?: string;
}

export function InstanceCard({
  instance,
  onStart,
  onViewConfig,
  onViewLogs,
  onContainerLogsOpen,
  onInspectContainer,
  filter,
}: InstanceCardProps) {
  const { stopInstance, restartInstance, deleteInstance, pruneInstance, isRunningCommand, activeProfile } =
    useColimaStore(
      useShallow((s) => ({
        stopInstance: s.stopInstance,
        restartInstance: s.restartInstance,
        deleteInstance: s.deleteInstance,
        pruneInstance: s.pruneInstance,
        isRunningCommand: s.isRunningCommand,
        activeProfile: s.activeProfile,
      }))
    );
  const { skipPruneConfirm, update: updateSettings } = useSettingsStore();
  // Narrowed to this profile's counter, so a Docker event on one instance no
  // longer re-renders every other instance's card.
  const tick = useColimaStore((s) => s.dockerRefreshTick[instance.profile] ?? 0);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);
  // Demo mode opens the containers section so screenshots show populated cards.
  const [showContainers, setShowContainers] = useState(DEMO_MODE);
  const [showStopped, setShowStopped] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [pruningImages, setPruningImages] = useState(false);
  const [showVolumes, setShowVolumes] = useState(false);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [volumesLoading, setVolumesLoading] = useState(false);
  const [pruningVolumes, setPruningVolumes] = useState(false);

  const isRunning = instance.status.toLowerCase() === "running";
  const isThisRunning = isRunningCommand && activeProfile === instance.profile;
  const isBusy = isRunningCommand;

  const query = (filter ?? "").trim().toLowerCase();
  const searching = query.length > 0;
  // While searching, every section is treated as open so matches are visible.
  const containersOpen = showContainers || searching;
  const imagesOpen = showImages || searching;
  const volumesOpen = showVolumes || searching;

  const dockerContext =
    instance.profile === "default" ? "colima" : `colima-${instance.profile}`;

  const fetchContainers = () => {
    if (!isRunning) return;
    setContainersLoading(true);
    invoke<DockerContainer[]>("get_containers", { profile: instance.profile, showAll: showStopped })
      .then(setContainers)
      .catch(() => setContainers([]))
      .finally(() => setContainersLoading(false));
  };

  const fetchImages = () => {
    if (!isRunning) return;
    setImagesLoading(true);
    invoke<DockerImage[]>("get_images", { profile: instance.profile })
      .then(setImages)
      .catch(() => setImages([]))
      .finally(() => setImagesLoading(false));
  };

  const fetchVolumes = () => {
    if (!isRunning) return;
    setVolumesLoading(true);
    invoke<DockerVolume[]>("get_volumes", { profile: instance.profile })
      .then(setVolumes)
      .catch(() => setVolumes([]))
      .finally(() => setVolumesLoading(false));
  };

  // Docker events arrive continuously — health-check exec events alone are about
  // one per second — and each one used to fire an unguarded refresh. Every one of
  // these invokes spawns a `docker` child process, so when the daemon got slow
  // they piled up faster than they finished. Keep at most one refresh in flight.
  const refreshing = useRef(false);

  const silentRefresh = async () => {
    if (!isRunning || refreshing.current) return;
    refreshing.current = true;
    try {
      await Promise.all([
        showContainers &&
          invoke<DockerContainer[]>("get_containers", { profile: instance.profile, showAll: showStopped })
            .then(setContainers).catch(() => {}),
        showImages &&
          invoke<DockerImage[]>("get_images", { profile: instance.profile })
            .then(setImages).catch(() => {}),
        showVolumes &&
          invoke<DockerVolume[]>("get_volumes", { profile: instance.profile })
            .then(setVolumes).catch(() => {}),
      ]);
    } finally {
      refreshing.current = false;
    }
  };

  useEffect(() => {
    if (containersOpen && isRunning) fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containersOpen, isRunning, showStopped]);

  useEffect(() => {
    if (imagesOpen && isRunning) fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesOpen, isRunning]);

  useEffect(() => {
    if (volumesOpen && isRunning) fetchVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumesOpen, isRunning]);

  const handlePruneImages = async () => {
    setPruningImages(true);
    try {
      await invoke("prune_images", { profile: instance.profile });
      fetchImages();
    } finally {
      setPruningImages(false);
    }
  };

  const handlePruneVolumes = async () => {
    setPruningVolumes(true);
    try {
      await invoke("prune_volumes", { profile: instance.profile });
      fetchVolumes();
    } finally {
      setPruningVolumes(false);
    }
  };

  useEffect(() => {
    if (!isThisRunning && isRunning) silentRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThisRunning]);

  useEffect(() => {
    if (tick === 0 || !isRunning) return;
    // Collapse bursts of Docker events into one refresh — the cleanup cancels the
    // pending timer whenever another event lands before it fires.
    const t = setTimeout(silentRefresh, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const handleStop = async () => {
    onViewLogs();
    await stopInstance(instance.profile);
  };

  const handleRestart = async () => {
    onViewLogs();
    await restartInstance(instance.profile);
  };

  const handleDelete = async () => {
    setShowConfirmDelete(false);
    onViewLogs();
    await deleteInstance(instance.profile);
  };

  const handlePrune = () => {
    if (skipPruneConfirm) {
      doPrune();
    } else {
      setShowPruneConfirm(true);
    }
  };

  const doPrune = async () => {
    setShowPruneConfirm(false);
    onViewLogs();
    await pruneInstance(instance.profile);
  };

  const visibleContainers = searching
    ? containers.filter(
        (c) =>
          (c.names ?? "").toLowerCase().includes(query) ||
          (c.image ?? "").toLowerCase().includes(query)
      )
    : containers;
  const visibleImages = searching
    ? images.filter(
        (i) =>
          `${i.repository}:${i.tag}`.toLowerCase().includes(query) ||
          i.id.toLowerCase().includes(query)
      )
    : images;
  const visibleVolumes = searching
    ? volumes.filter((v) => v.name.toLowerCase().includes(query))
    : volumes;

  return (
    <div
      className={cn(
        "rounded-card border overflow-hidden transition-all",
        isThisRunning
          ? "border-blue-500/30 bg-blue-500/[0.06] ring-1 ring-blue-400/30"
          : isRunning
          ? "border-border bg-surface-raised"
          : "border-border-subtle bg-surface"
      )}
    >
      {showPruneConfirm && (
        <PruneConfirmModal
          profile={instance.profile}
          onCancel={() => setShowPruneConfirm(false)}
          onConfirm={(dontAskAgain) => {
            if (dontAskAgain) updateSettings({ skipPruneConfirm: true });
            doPrune();
          }}
        />
      )}

      {/* Card body */}
      <div className="px-3 pt-3 pb-3">
        {/* Header row: icon chip · name + specs · status · (stopped: inline controls) */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-[34px] h-[34px] rounded-ctl flex items-center justify-center flex-shrink-0",
              isRunning ? "bg-blue-500/[0.16] text-blue-300" : "bg-surface text-fg-faint"
            )}
          >
            <Server size={17} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "font-semibold text-[15px] truncate",
                  isRunning ? "text-fg" : "text-fg-secondary"
                )}
              >
                {instance.profile}
              </span>
              <span className="text-[10px] text-fg-muted bg-surface rounded-chip px-1.5 py-0.5 font-mono flex-shrink-0">
                {instance.runtime}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-fg-muted truncate">
              <span className="flex items-center gap-1 flex-shrink-0">
                <Cpu size={11} className="text-icon" />
                {instance.cpus}
              </span>
              <span className="text-fg-faint">·</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                <MemoryStick size={11} className="text-icon" />
                {instance.memory}
              </span>
              <span className="text-fg-faint">·</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                <HardDrive size={11} className="text-icon" />
                {instance.disk}
              </span>
              <span className="text-fg-faint">·</span>
              <span className="font-mono flex-shrink-0">{instance.arch}</span>
              {isRunning && instance.address && instance.address !== "—" && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span className="font-mono truncate">{instance.address}</span>
                </>
              )}
            </div>
          </div>
          <StatusBadge status={instance.status} className="flex-shrink-0" />
          {!isRunning && !showConfirmDelete && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                icon={<Play size={12} />}
                tone="start"
                onClick={() => onStart(instance.profile)}
                disabled={isBusy}
              >
                Start
              </Button>
              <IconButton
                icon={<FileText size={14} />}
                onClick={() => onViewConfig(instance.profile)}
                title="View config"
              />
              <IconButton
                icon={<Trash2 size={14} />}
                danger
                onClick={() => setShowConfirmDelete(true)}
                disabled={isBusy}
                title="Delete instance"
              />
            </div>
          )}
        </div>

        {/* Delete confirm (stopped instances only) */}
        {showConfirmDelete && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-red-400/80 flex-1">
              Delete <span className="font-medium">{instance.profile}</span>?
            </span>
            <Button onClick={() => setShowConfirmDelete(false)}>Cancel</Button>
            <Button tone="stop" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        )}

        {/* Actions (running instances) */}
        {isRunning && !showConfirmDelete && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Button
              icon={<Square size={12} />}
              tone="stop"
              onClick={handleStop}
              disabled={isBusy}
            >
              Stop
            </Button>
            <Button
              icon={<RotateCcw size={12} />}
              tone="primary"
              onClick={handleRestart}
              disabled={isBusy}
            >
              Restart
            </Button>
            <Button
              icon={<FileText size={12} />}
              onClick={() => onViewConfig(instance.profile)}
            >
              Config
            </Button>
            <Button
              icon={<Scissors size={12} />}
              tone="warn"
              onClick={handlePrune}
              disabled={isBusy}
            >
              Prune
            </Button>
          </div>
        )}

        {isThisRunning && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-blue-400/80">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            Running command...
          </div>
        )}
      </div>

      {/* VM Stats */}
      {isRunning && <VmStatsBar profile={instance.profile} />}

      {/* Containers / Images / Volumes accordions */}
      {isRunning && (
        <>
        <div className="border-t border-border-subtle">
          <div className="flex items-center px-3 py-2.5">
            <button
              onClick={() => setShowContainers((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {containersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Containers</span>
              {visibleContainers.length > 0 && (
                <CountPill>{visibleContainers.length}</CountPill>
              )}
            </button>
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
          </div>

          {containersOpen && (() => {
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
              <div className="px-3 pb-3 space-y-3 max-h-80 overflow-y-auto">
                {containersLoading && containers.length === 0 ? (
                  <p className="text-xs text-fg-faint">Loading...</p>
                ) : visibleContainers.length === 0 ? (
                  <p className="text-xs text-fg-muted italic">
                    {searching ? "No matches" : showStopped ? "No containers" : "No running containers"}
                  </p>
                ) : (
                  <>
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
                                  context={dockerContext}
                                  profile={instance.profile}
                                  onLogsOpen={onContainerLogsOpen}
                                  onRefresh={fetchContainers}
                                  onInspect={onInspectContainer}
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
                        context={dockerContext}
                        profile={instance.profile}
                        onLogsOpen={onContainerLogsOpen}
                        onRefresh={fetchContainers}
                        onInspect={onInspectContainer}
                      />
                    ))}
                  </>
                )}

                {/* Container resource stats — kept mounted while searching so
                    the docker-stats poll cadence isn't reset by a remount */}
                {containers.length > 0 && (
                  <div className={searching ? "hidden" : undefined}>
                    <ContainerStatsPanel profile={instance.profile} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Images accordion */}
        <div className="border-t border-border-subtle">
          <div className="flex items-center px-3 py-2.5">
            <button
              onClick={() => setShowImages((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {imagesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Images</span>
              {visibleImages.length > 0 && (
                <CountPill>{visibleImages.length}</CountPill>
              )}
            </button>
            {showImages && images.some((i) => i.repository === "<none>" || i.tag === "<none>") && (
              <button
                onClick={handlePruneImages}
                disabled={pruningImages}
                className="text-xs text-amber-400/70 hover:text-amber-400 transition-all disabled:opacity-40"
                title="Remove dangling images"
              >
                {pruningImages ? "Pruning..." : "Prune dangling"}
              </button>
            )}
          </div>

          {imagesOpen && (
            <div className="px-3 pb-3 space-y-3 max-h-80 overflow-y-auto">
              <ImagePull
                profile={instance.profile}
                onPulled={fetchImages}
                onViewLogs={onViewLogs}
              />
              {imagesLoading && images.length === 0 ? (
                <p className="text-xs text-fg-faint">Loading...</p>
              ) : visibleImages.length === 0 ? (
                <p className="text-xs text-fg-muted italic">{searching ? "No matches" : "No images"}</p>
              ) : (
                visibleImages.map((img) => (
                  <ImageRow
                    key={img.id}
                    image={img}
                    profile={instance.profile}
                    onRefresh={fetchImages}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Volumes accordion */}
        <div className="border-t border-border-subtle">
          <div className="flex items-center px-3 py-2.5">
            <button
              onClick={() => setShowVolumes((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {volumesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Volumes</span>
              {visibleVolumes.length > 0 && (
                <CountPill>{visibleVolumes.length}</CountPill>
              )}
            </button>
            {showVolumes && volumes.length > 0 && (
              <button
                onClick={handlePruneVolumes}
                disabled={pruningVolumes}
                className="text-xs text-amber-400/70 hover:text-amber-400 transition-all disabled:opacity-40"
                title="Remove volumes not used by any container"
              >
                {pruningVolumes ? "Pruning..." : "Prune unused"}
              </button>
            )}
          </div>

          {volumesOpen && (
            <div className="px-3 pb-3 space-y-3 max-h-80 overflow-y-auto">
              {volumesLoading && volumes.length === 0 ? (
                <p className="text-xs text-fg-faint">Loading...</p>
              ) : visibleVolumes.length === 0 ? (
                <p className="text-xs text-fg-muted italic">{searching ? "No matches" : "No volumes"}</p>
              ) : (
                visibleVolumes.map((vol) => (
                  <VolumeRow
                    key={vol.name}
                    volume={vol}
                    profile={instance.profile}
                    onRefresh={fetchVolumes}
                  />
                ))
              )}
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
