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
import { cn } from "../lib/utils";
import type { ColimaInstance, DockerContainer, ContainerLogsTarget } from "../types";

interface InstanceCardProps {
  instance: ColimaInstance;
  onStart: (profile: string) => void;
  onViewConfig: (profile: string) => void;
  onViewLogs: () => void;
  onContainerLogsOpen: (target: ContainerLogsTarget) => void;
}

export function InstanceCard({
  instance,
  onStart,
  onViewConfig,
  onViewLogs,
  onContainerLogsOpen,
}: InstanceCardProps) {
  const { stopInstance, restartInstance, deleteInstance, pruneInstance, isRunningCommand, activeProfile } =
    useColimaStore();

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showContainers, setShowContainers] = useState(false);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);

  const isRunning = instance.status.toLowerCase() === "running";
  const isThisRunning = isRunningCommand && activeProfile === instance.profile;
  const isBusy = isRunningCommand;

  const dockerContext =
    instance.profile === "default" ? "colima" : `colima-${instance.profile}`;

  const fetchContainers = () => {
    if (!isRunning) return;
    setContainersLoading(true);
    invoke<DockerContainer[]>("get_containers", { profile: instance.profile })
      .then((c) => setContainers(c))
      .catch(() => setContainers([]))
      .finally(() => setContainersLoading(false));
  };

  useEffect(() => {
    if (showContainers && isRunning) fetchContainers();
  }, [showContainers, isRunning]);

  useEffect(() => {
    if (!isThisRunning && showContainers && isRunning) fetchContainers();
  }, [isThisRunning]);

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
          : "border-white/[0.09] bg-white/[0.05]"
      )}
    >
      {/* Card body */}
      <div className="px-4 pt-3.5 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[13px] text-[#e2e3e6] truncate">
              {instance.profile}
            </span>
            <span className="text-[10.5px] text-[#555] bg-white/[0.05] rounded px-1.5 py-0.5 font-mono">
              {instance.runtime}
            </span>
          </div>
          <StatusBadge status={instance.status} />
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-3.5 mb-3.5 text-[10.5px] text-[#666]">
          <span className="flex items-center gap-1">
            <Cpu size={10} className="text-[#555]" />
            {instance.cpus}
          </span>
          <span className="flex items-center gap-1">
            <MemoryStick size={10} className="text-[#555]" />
            {instance.memory}
          </span>
          <span className="flex items-center gap-1">
            <HardDrive size={10} className="text-[#555]" />
            {instance.disk}
          </span>
          <span className="text-[#4a4b50]">{instance.arch}</span>
          {instance.address && instance.address !== "—" && (
            <span className="text-[#4a4b50] font-mono text-[9.5px]">{instance.address}</span>
          )}
        </div>

        {/* Actions */}
        {showConfirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-400/80 flex-1">
              Delete <span className="font-medium">{instance.profile}</span>?
            </span>
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="text-[10.5px] px-2.5 py-1 rounded-lg bg-white/[0.06] text-[#777] hover:text-[#b0b1b4] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-[10.5px] px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {isRunning ? (
              <>
                <ActionBtn
                  icon={<Square size={10} />}
                  label="Stop"
                  onClick={handleStop}
                  disabled={isBusy}
                  variant="stop"
                />
                <ActionBtn
                  icon={<RotateCcw size={10} />}
                  label="Restart"
                  onClick={handleRestart}
                  disabled={isBusy}
                  variant="restart"
                />
              </>
            ) : (
              <ActionBtn
                icon={<Play size={10} />}
                label="Start"
                onClick={() => onStart(instance.profile)}
                disabled={isBusy}
                variant="start"
              />
            )}
            <ActionBtn
              icon={<FileText size={10} />}
              label="Config"
              onClick={() => onViewConfig(instance.profile)}
              disabled={false}
              variant="default"
            />
            {isRunning && (
              <ActionBtn
                icon={<Scissors size={10} />}
                label="Prune"
                onClick={handlePrune}
                disabled={isBusy}
                variant="warn"
              />
            )}
            <div className="flex-1" />
            <ActionBtn
              icon={<Trash2 size={10} />}
              label=""
              onClick={() => setShowConfirmDelete(true)}
              disabled={isBusy || isRunning}
              variant="danger"
              title="Delete instance"
            />
          </div>
        )}

        {isThisRunning && (
          <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-blue-400/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Running command…
          </div>
        )}
      </div>

      {/* Containers accordion */}
      {isRunning && (
        <div className="border-t border-white/[0.06]">
          <button
            onClick={() => setShowContainers((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10.5px] text-[#666] hover:text-[#999] hover:bg-white/[0.03] transition-all"
          >
            <span className="flex items-center gap-1.5">
              {showContainers ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <span>Containers</span>
              {containers.length > 0 && (
                <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[9.5px] text-[#666]">
                  {containers.length}
                </span>
              )}
            </span>
          </button>

          {showContainers && (
            <div className="px-4 pb-3.5 space-y-3">
              {containersLoading ? (
                <p className="text-[10.5px] text-[#555]">Loading…</p>
              ) : containers.length === 0 ? (
                <p className="text-[10.5px] text-[#444] italic">No running containers</p>
              ) : (
                containers.map((c) => (
                  <ContainerRow
                    key={c.id}
                    container={c}
                    context={dockerContext}
                    onLogsOpen={onContainerLogsOpen}
                    onRefresh={fetchContainers}
                  />
                ))
              )}
            </div>
          )}
        </div>
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
        "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-medium transition-all",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        variant === "start" && "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
        variant === "stop" && "bg-red-500/15 text-red-400 hover:bg-red-500/25",
        variant === "restart" && "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25",
        variant === "warn" && "bg-amber-500/12 text-amber-400 hover:bg-amber-500/20",
        variant === "default" && "bg-white/[0.06] text-[#888] hover:bg-white/[0.1] hover:text-[#b0b1b4]",
        variant === "danger" && "bg-transparent text-[#555] hover:bg-red-500/15 hover:text-red-400"
      )}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
