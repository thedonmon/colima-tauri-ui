import { RefreshCw, Plus } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useColimaStore } from "../store";
import { cn } from "../lib/utils";

interface HeaderProps {
  onRefresh: () => void;
  onNewInstance: () => void;
}

export function Header({ onRefresh, onNewInstance }: HeaderProps) {
  const { isLoading, version, dockerContexts } = useColimaStore();
  const activeContext = dockerContexts.find((c) => c.current);

  const handleDragMouseDown = async (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      const win = getCurrentWebviewWindow();
      await win.startDragging();
    }
  };

  return (
    <div
      className="border-b border-border select-none flex-shrink-0"
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
    >
      {/* Title-bar row */}
      <div className="h-9 flex items-center px-2.5">
        {/* Left: traffic-light reserve */}
        <div className="w-[76px] flex-shrink-0" />

        {/* Center: app identity */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="h-5 w-5 rounded-md bg-blue-500/25 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-xs font-bold leading-none select-none">C</span>
          </div>
          <span className="text-sm font-semibold text-fg tracking-tight">
            Colima Manager
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="w-[76px] flex items-center justify-end gap-1">
          <button
            onClick={onNewInstance}
            title="New instance"
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-xs text-fg-muted hover:bg-white/[0.11] hover:text-fg-secondary transition-all"
          >
            <Plus size={12} />
            New
          </button>
          <button
            onClick={onRefresh}
            title="Refresh"
            className="rounded-lg p-1.5 text-fg-faint hover:bg-white/[0.07] hover:text-fg-muted transition-all"
          >
            <RefreshCw size={13} className={cn(isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Sub-line: context + version */}
      <div className="pb-2 flex items-center justify-center gap-2.5">
        {activeContext ? (
          <span className="text-xs text-fg-faint">
            ctx:{" "}
            <span className="text-fg-muted font-mono">{activeContext.name}</span>
          </span>
        ) : (
          <span className="text-xs text-fg-faint">no docker context</span>
        )}
        {version && (
          <>
            <span className="text-fg-faint">·</span>
            <span className="text-xs text-fg-faint font-mono">
              colima {version.split("\n")[0].replace("colima version ", "v")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
