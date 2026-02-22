import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Square, RotateCcw, Pause, Play as Resume, ScrollText } from "lucide-react";
import { cn } from "../lib/utils";
import type { DockerContainer, ContainerLogsTarget } from "../types";

export interface ContainerRowProps {
  container: DockerContainer;
  context: string;
  onLogsOpen: (target: ContainerLogsTarget) => void;
  onRefresh: () => void;
}

type Action = "start" | "stop" | "restart" | "pause" | "unpause";

export function ContainerRow({ container, context, onLogsOpen, onRefresh }: ContainerRowProps) {
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-start gap-2.5">
        {/* Status dot */}
        <span
          className={cn(
            "mt-[5px] h-1.5 w-1.5 rounded-full flex-shrink-0",
            unhealthy
              ? "bg-red-400/80 animate-pulse"
              : paused
              ? "bg-yellow-400/70"
              : up
              ? "bg-green-500/70"
              : "bg-[#444]"
          )}
        />

        <div className="min-w-0 flex-1">
          {/* Name + image */}
          <p className="text-[11px] font-medium text-[#e0e0e0] truncate leading-snug">
            {container.names || "—"}
          </p>
          <p className="text-[10px] text-[#888] truncate">{container.image || "—"}</p>

          {/* Action buttons */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {paused ? (
              <Btn
                icon={<Resume size={9} />}
                label="Resume"
                onClick={() => handleAction("unpause")}
                active={busyAction === "unpause"}
                disabled={isBusy}
              />
            ) : up ? (
              <>
                <Btn
                  icon={<Square size={9} />}
                  label="Stop"
                  onClick={() => handleAction("stop")}
                  active={busyAction === "stop"}
                  disabled={isBusy}
                />
                <Btn
                  icon={<Pause size={9} />}
                  label="Pause"
                  onClick={() => handleAction("pause")}
                  active={busyAction === "pause"}
                  disabled={isBusy}
                />
                <Btn
                  icon={<RotateCcw size={9} />}
                  label="Restart"
                  onClick={() => handleAction("restart")}
                  active={busyAction === "restart"}
                  disabled={isBusy}
                />
              </>
            ) : (
              <Btn
                icon={<Play size={9} />}
                label="Start"
                onClick={() => handleAction("start")}
                active={busyAction === "start"}
                disabled={isBusy}
              />
            )}
            <Btn
              icon={<ScrollText size={9} />}
              label="Logs"
              onClick={() => onLogsOpen({ container, context })}
              active={false}
              disabled={false}
            />
          </div>

          {/* Inline error */}
          {error && (
            <p className="text-[10px] text-red-400/80 mt-1 leading-snug">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface BtnProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
}

function Btn({ icon, label, onClick, active, disabled }: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-all",
        "bg-white/6 hover:bg-white/12 hover:text-[#c1c2c5]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "text-blue-400" : "text-[#999]"
      )}
    >
      {active ? (
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
