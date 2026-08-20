import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Square, RotateCcw, Pause, Play as Resume, ScrollText, Trash2, Terminal, Search } from "lucide-react";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";
import type { DockerContainer, ContainerLogsTarget } from "../types";

export interface ContainerRowProps {
  container: DockerContainer;
  context: string;
  profile?: string;
  onLogsOpen: (target: ContainerLogsTarget) => void;
  onRefresh: () => void;
  onInspect?: (profile: string, containerId: string, containerName: string) => void;
}

type Action = "start" | "stop" | "restart" | "pause" | "unpause" | "rm";

export function ContainerRow({ container, context, profile, onLogsOpen, onRefresh, onInspect }: ContainerRowProps) {
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
              ? "bg-emerald-400"
              : "bg-white/[0.25]"
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-fg truncate leading-snug">
            {container.names || "—"}
          </p>
          <p className="text-xs text-fg-muted font-mono truncate mb-2">
            {container.image || "—"}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {paused ? (
              <Button
                size="sm"
                icon={<Resume size={11} />}
                tone="start"
                onClick={() => handleAction("unpause")}
                busy={busyAction === "unpause"}
                disabled={isBusy}
              >
                Resume
              </Button>
            ) : up ? (
              <>
                <Button
                  size="sm"
                  icon={<Square size={11} />}
                  tone="stop"
                  onClick={() => handleAction("stop")}
                  busy={busyAction === "stop"}
                  disabled={isBusy}
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  icon={<Pause size={11} />}
                  tone="warn"
                  onClick={() => handleAction("pause")}
                  busy={busyAction === "pause"}
                  disabled={isBusy}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  icon={<RotateCcw size={11} />}
                  tone="primary"
                  onClick={() => handleAction("restart")}
                  busy={busyAction === "restart"}
                  disabled={isBusy}
                >
                  Restart
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  icon={<Play size={11} />}
                  tone="start"
                  onClick={() => handleAction("start")}
                  busy={busyAction === "start"}
                  disabled={isBusy}
                >
                  Start
                </Button>
                {confirmRemove ? (
                  <>
                    <Button size="sm" onClick={() => setConfirmRemove(false)} disabled={isBusy}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      tone="stop"
                      onClick={() => handleAction("rm")}
                      busy={busyAction === "rm"}
                      disabled={isBusy}
                    >
                      Confirm
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    icon={<Trash2 size={11} />}
                    tone="stop"
                    onClick={() => setConfirmRemove(true)}
                    disabled={isBusy}
                  >
                    Remove
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              icon={<ScrollText size={11} />}
              onClick={() => onLogsOpen({ container, context })}
            >
              Logs
            </Button>
            {up && profile && (
              <Button
                size="sm"
                icon={<Terminal size={11} />}
                onClick={() => invoke("container_exec", { profile, containerId: container.id })}
              >
                Exec
              </Button>
            )}
            {profile && onInspect && (
              <Button
                size="sm"
                icon={<Search size={11} />}
                onClick={() => onInspect(profile, container.id, container.names || container.id)}
              >
                Inspect
              </Button>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400/70 mt-1.5 leading-snug">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
