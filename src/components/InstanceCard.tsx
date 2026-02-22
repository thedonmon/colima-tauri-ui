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
        "rounded-xl border border-white/[0.11] bg-white/[0.06] overflow-hidden transition-all",
        isThisRunning && "border-blue-500/40 bg-blue-500/[0.07]"
      )}
    >
      {/* Card body */}
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[13px] text-white truncate">{instance.profile}</span>
            <span className="text-[#777] text-[11px]">{instance.runtime}</span>
          </div>
          <StatusBadge status={instance.status} />
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-4 mb-4 text-[11px] text-[#999]">
          <span className="flex items-center gap-1.5">
            <Cpu size={11} className="text-[#777]" />
            {instance.cpus}
          </span>
          <span className="flex items-center gap-1.5">
            <MemoryStick size={11} className="text-[#777]" />
            {instance.memory}
          </span>
          <span className="flex items-center gap-1.5">
            <HardDrive size={11} className="text-[#777]" />
            {instance.disk}
          </span>
          <span className="text-[#888]">{instance.arch}</span>
          {instance.address && instance.address !== "—" && (
            <span className="text-[#777] font-mono text-[10px]">{instance.address}</span>
          )}
        </div>

        {/* Actions */}
        {showConfirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-400 flex-1">Delete {instance.profile}?</span>
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="text-[11px] px-2 py-1 rounded-md bg-white/8 text-[#999] hover:text-[#c1c2c5] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-[11px] px-2 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {isRunning ? (
              <>
                <ActionBtn icon={<Square size={11} />} label="Stop" onClick={handleStop} disabled={isBusy} variant="default" />
                <ActionBtn icon={<RotateCcw size={11} />} label="Restart" onClick={handleRestart} disabled={isBusy} variant="default" />
              </>
            ) : (
              <ActionBtn icon={<Play size={11} />} label="Start" onClick={() => onStart(instance.profile)} disabled={isBusy} variant="primary" />
            )}
            <ActionBtn icon={<FileText size={11} />} label="Config" onClick={() => onViewConfig(instance.profile)} disabled={false} variant="default" />
            {isRunning && (
              <ActionBtn icon={<Scissors size={11} />} label="Prune" onClick={handlePrune} disabled={isBusy} variant="default" />
            )}
            <div className="flex-1" />
            <ActionBtn
              icon={<Trash2 size={11} />}
              label=""
              onClick={() => setShowConfirmDelete(true)}
              disabled={isBusy || isRunning}
              variant="danger"
              title="Delete instance"
            />
          </div>
        )}

        {isThisRunning && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-blue-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Running command…
          </div>
        )}
      </div>

      {/* Containers accordion */}
      {isRunning && (
        <div className="border-t border-white/[0.07]">
          <button
            onClick={() => setShowContainers((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-[#888] hover:text-[#bbb] hover:bg-white/5 transition-all"
          >
            <span className="flex items-center gap-2">
              {showContainers ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Containers
              {containers.length > 0 && !showContainers && (
                <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] text-[#888]">
                  {containers.length}
                </span>
              )}
            </span>
          </button>

          {showContainers && (
            <div className="px-4 pb-4 space-y-3">
              {containersLoading ? (
                <p className="text-[11px] text-[#666]">Loading…</p>
              ) : containers.length === 0 ? (
                <p className="text-[11px] text-[#666] italic">No running containers</p>
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

interface ActionBtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: "primary" | "default" | "danger";
  title?: string;
}

function ActionBtn({ icon, label, onClick, disabled, variant, title }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "primary" && "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30",
        variant === "default" && "bg-white/8 text-[#aaaaad] hover:bg-white/12 hover:text-[#c1c2c5]",
        variant === "danger" && "bg-transparent text-[#888] hover:bg-red-500/15 hover:text-red-400"
      )}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
