import { useState, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Scissors,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useColimaStore } from "../store";
import { StatusBadge } from "./StatusBadge";
import { ContainerRow } from "./ContainerRow";
import { ImageRow } from "./ImageRow";
import { VolumeRow } from "./VolumeRow";
import { VmStatsBar } from "./VmStatsBar";
import { ContainerStatsPanel } from "./ContainerStatsRow";
import { ImagePull } from "./ImagePull";
import { cn } from "../lib/utils";
import type { ColimaInstance, DockerContainer, DockerImage, DockerVolume, ContainerLogsTarget } from "../types";

interface InstanceCardProps {
  instance: ColimaInstance;
  onStart: (profile: string) => void;
  onViewConfig: (profile: string) => void;
  onViewLogs: () => void;
  onContainerLogsOpen: (target: ContainerLogsTarget) => void;
  onInspectContainer: (profile: string, containerId: string, containerName: string) => void;
}

export function InstanceCard({
  instance,
  onStart,
  onViewConfig,
  onViewLogs,
  onContainerLogsOpen,
  onInspectContainer,
}: InstanceCardProps) {
  const { stopInstance, restartInstance, deleteInstance, pruneInstance, isRunningCommand, activeProfile, dockerRefreshTick } =
    useColimaStore();
  const tick = dockerRefreshTick[instance.profile] ?? 0;

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showContainers, setShowContainers] = useState(false);
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

  const silentRefresh = () => {
    if (!isRunning) return;
    if (showContainers)
      invoke<DockerContainer[]>("get_containers", { profile: instance.profile, showAll: showStopped })
        .then(setContainers).catch(() => {});
    if (showImages)
      invoke<DockerImage[]>("get_images", { profile: instance.profile })
        .then(setImages).catch(() => {});
    if (showVolumes)
      invoke<DockerVolume[]>("get_volumes", { profile: instance.profile })
        .then(setVolumes).catch(() => {});
  };

  useEffect(() => {
    if (showContainers && isRunning) fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContainers, isRunning, showStopped]);

  useEffect(() => {
    if (showImages && isRunning) fetchImages();
  }, [showImages, isRunning]);

  useEffect(() => {
    if (showVolumes && isRunning) fetchVolumes();
  }, [showVolumes, isRunning]);

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
    silentRefresh();
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

  const handlePrune = async () => {
    onViewLogs();
    await pruneInstance(instance.profile);
  };

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all",
        isThisRunning
          ? "border-blue-500/30 bg-blue-500/[0.06]"
          : "border-border bg-white/[0.04]"
      )}
    >
      {/* Card body */}
      <div className="px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-[15px] text-fg truncate">
              {instance.profile}
            </span>
            <span className="text-xs text-fg-muted bg-white/[0.06] rounded-md px-2 py-0.5 font-mono">
              {instance.runtime}
            </span>
          </div>
          <StatusBadge status={instance.status} />
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-4 mb-4 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Cpu size={12} className="text-icon" />
            {instance.cpus}
          </span>
          <span className="flex items-center gap-1.5">
            <MemoryStick size={12} className="text-icon" />
            {instance.memory}
          </span>
          <span className="flex items-center gap-1.5">
            <HardDrive size={12} className="text-icon" />
            {instance.disk}
          </span>
          <span className="text-fg-muted">{instance.arch}</span>
          {instance.address && instance.address !== "—" && (
            <span className="text-fg-muted font-mono">{instance.address}</span>
          )}
        </div>

        {/* Actions */}
        {showConfirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-400/80 flex-1">
              Delete <span className="font-medium">{instance.profile}</span>?
            </span>
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-fg-muted hover:text-fg-secondary transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {isRunning ? (
              <>
                <ActionBtn
                  icon={<Square size={12} />}
                  label="Stop"
                  onClick={handleStop}
                  disabled={isBusy}
                  variant="stop"
                />
                <ActionBtn
                  icon={<RotateCcw size={12} />}
                  label="Restart"
                  onClick={handleRestart}
                  disabled={isBusy}
                  variant="restart"
                />
              </>
            ) : (
              <ActionBtn
                icon={<Play size={12} />}
                label="Start"
                onClick={() => onStart(instance.profile)}
                disabled={isBusy}
                variant="start"
              />
            )}
            <ActionBtn
              icon={<FileText size={12} />}
              label="Config"
              onClick={() => onViewConfig(instance.profile)}
              disabled={false}
              variant="default"
            />
            {isRunning && (
              <ActionBtn
                icon={<Scissors size={12} />}
                label="Prune"
                onClick={handlePrune}
                disabled={isBusy}
                variant="warn"
              />
            )}
            <div className="flex-1" />
            <ActionBtn
              icon={<Trash2 size={12} />}
              label=""
              onClick={() => setShowConfirmDelete(true)}
              disabled={isBusy || isRunning}
              variant="danger"
              title="Delete instance"
            />
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
          <div className="flex items-center px-4 py-2.5">
            <button
              onClick={() => setShowContainers((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {showContainers ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Containers</span>
              {containers.length > 0 && (
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-fg-muted">
                  {containers.length}
                </span>
              )}
            </button>
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
          </div>

          {showContainers && (() => {
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
              <div className="px-4 pb-4 space-y-3">
                {containersLoading && containers.length === 0 ? (
                  <p className="text-xs text-fg-faint">Loading...</p>
                ) : containers.length === 0 ? (
                  <p className="text-xs text-fg-muted italic">
                    {showStopped ? "No containers" : "No running containers"}
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

                {/* Container resource stats */}
                {containers.length > 0 && (
                  <ContainerStatsPanel profile={instance.profile} />
                )}
              </div>
            );
          })()}
        </div>

        {/* Images accordion */}
        <div className="border-t border-border-subtle">
          <div className="flex items-center px-4 py-2.5">
            <button
              onClick={() => setShowImages((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {showImages ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Images</span>
              {images.length > 0 && (
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-fg-muted">
                  {images.length}
                </span>
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

          {showImages && (
            <div className="px-4 pb-4 space-y-3">
              <ImagePull
                profile={instance.profile}
                onPulled={fetchImages}
                onViewLogs={onViewLogs}
              />
              {imagesLoading && images.length === 0 ? (
                <p className="text-xs text-fg-faint">Loading...</p>
              ) : images.length === 0 ? (
                <p className="text-xs text-fg-muted italic">No images</p>
              ) : (
                images.map((img) => (
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
          <div className="flex items-center px-4 py-2.5">
            <button
              onClick={() => setShowVolumes((v) => !v)}
              className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg-secondary transition-all flex-1"
            >
              {showVolumes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Volumes</span>
              {volumes.length > 0 && (
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-fg-muted">
                  {volumes.length}
                </span>
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

          {showVolumes && (
            <div className="px-4 pb-4 space-y-3">
              {volumesLoading && volumes.length === 0 ? (
                <p className="text-xs text-fg-faint">Loading...</p>
              ) : volumes.length === 0 ? (
                <p className="text-xs text-fg-muted italic">No volumes</p>
              ) : (
                volumes.map((vol) => (
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

type ActionVariant = "start" | "stop" | "restart" | "warn" | "default" | "danger";

interface ActionBtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: ActionVariant;
  title?: string;
}

function ActionBtn({ icon, label, onClick, disabled, variant, title }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        variant === "start" && "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
        variant === "stop" && "bg-red-500/15 text-red-400 hover:bg-red-500/25",
        variant === "restart" && "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25",
        variant === "warn" && "bg-amber-500/12 text-amber-400 hover:bg-amber-500/20",
        variant === "default" && "bg-white/[0.06] text-fg-muted hover:bg-white/[0.1] hover:text-fg-secondary",
        variant === "danger" && "bg-transparent text-fg-faint hover:bg-red-500/15 hover:text-red-400"
      )}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
