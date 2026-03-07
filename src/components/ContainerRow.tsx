import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Square, RotateCcw, Pause, Play as Resume, ScrollText, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import type { DockerContainer, ContainerLogsTarget } from "../types";

export interface ContainerRowProps {
  container: DockerContainer;
  context: string;
  onLogsOpen: (target: ContainerLogsTarget) => void;
  onRefresh: () => void;
}

type Action = "start" | "stop" | "restart" | "pause" | "unpause" | "rm";

export function ContainerRow({ container, context, onLogsOpen, onRefresh }: ContainerRowProps) {
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const status = container.status ?? "";
  const up = status.toLowerCase().startsWith("up");
  const paused = status.toLowerCase().includes("(paused)");
  const unhealthy = status.includes("unhealthy");
  const isBusy = busyAction !== null;

  const handleAction = async (action: Action) => {
    setBusyAction(action);
    setError(null);
    try {
      await invoke("container_action", {
        context,
        containerId: container.id,
        action,
      });
      onRefresh();
    } catch (e) {
      setError(String(e).replace(/^.*?container_action.*?: /, ""));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <span
          className={cn(
            "mt-[6px] h-2 w-2 rounded-full flex-shrink-0",
            unhealthy
              ? "bg-red-400/80 animate-pulse"
              : paused
              ? "bg-amber-400/70"
              : up
              ? "bg-emerald-500/80"
              : "bg-border"
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg truncate leading-snug">
            {container.names || "—"}
          </p>
          <p className="text-xs text-fg-muted truncate mb-2">{container.image || "—"}</p>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {paused ? (
              <ContainerBtn
                icon={<Resume size={11} />}
                label="Resume"
                onClick={() => handleAction("unpause")}
                active={busyAction === "unpause"}
                disabled={isBusy}
                variant="start"
              />
            ) : up ? (
              <>
                <ContainerBtn
                  icon={<Square size={11} />}
                  label="Stop"
                  onClick={() => handleAction("stop")}
                  active={busyAction === "stop"}
                  disabled={isBusy}
                  variant="stop"
                />
                <ContainerBtn
                  icon={<Pause size={11} />}
                  label="Pause"
                  onClick={() => handleAction("pause")}
                  active={busyAction === "pause"}
                  disabled={isBusy}
                  variant="pause"
                />
                <ContainerBtn
                  icon={<RotateCcw size={11} />}
                  label="Restart"
                  onClick={() => handleAction("restart")}
                  active={busyAction === "restart"}
                  disabled={isBusy}
                  variant="restart"
                />
              </>
            ) : (
              <>
                <ContainerBtn
                  icon={<Play size={11} />}
                  label="Start"
                  onClick={() => handleAction("start")}
                  active={busyAction === "start"}
                  disabled={isBusy}
                  variant="start"
                />
                {confirmRemove ? (
                  <>
                    <ContainerBtn
                      icon={null}
                      label="Cancel"
                      onClick={() => setConfirmRemove(false)}
                      active={false}
                      disabled={isBusy}
                      variant="default"
                    />
                    <ContainerBtn
                      icon={null}
                      label="Confirm"
                      onClick={() => handleAction("rm")}
                      active={busyAction === "rm"}
                      disabled={isBusy}
                      variant="danger"
                    />
                  </>
                ) : (
                  <ContainerBtn
                    icon={<Trash2 size={11} />}
                    label="Remove"
                    onClick={() => setConfirmRemove(true)}
                    active={false}
                    disabled={isBusy}
                    variant="danger"
                  />
                )}
              </>
            )}
            <ContainerBtn
              icon={<ScrollText size={11} />}
              label="Logs"
              onClick={() => onLogsOpen({ container, context })}
              active={false}
              disabled={false}
              variant="default"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400/70 mt-1.5 leading-snug">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

type BtnVariant = "start" | "stop" | "pause" | "restart" | "default" | "danger";

interface BtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
  variant: BtnVariant;
}

function ContainerBtn({ icon, label, onClick, active, disabled, variant }: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        active && "opacity-70",
        variant === "start" && "bg-emerald-500/12 text-emerald-400 hover:bg-emerald-500/20",
        variant === "stop" && "bg-red-500/12 text-red-400 hover:bg-red-500/20",
        variant === "pause" && "bg-amber-500/12 text-amber-400 hover:bg-amber-500/20",
        variant === "restart" && "bg-blue-500/12 text-blue-400 hover:bg-blue-500/20",
        variant === "default" && "bg-white/[0.05] text-fg-muted hover:bg-white/[0.09] hover:text-fg-secondary",
        variant === "danger" && "bg-red-500/12 text-red-400 hover:bg-red-500/20"
      )}
    >
      {active ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
