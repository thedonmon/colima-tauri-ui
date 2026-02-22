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
      className="border-b border-white/[0.07] select-none flex-shrink-0"
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
    >
      {/* Title-bar row — h-8 for traffic lights */}
      <div className="h-8 flex items-center px-2">
        {/* Left: traffic-light reserve */}
        <div className="w-[76px] flex-shrink-0" />

        {/* Center: app identity */}
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <div className="h-[18px] w-[18px] rounded-[5px] bg-blue-500/25 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-[10px] font-bold leading-none select-none">C</span>
          </div>
          <span className="text-[12px] font-semibold text-[#d8d9dc] tracking-tight">
            Colima Manager
          </span>
        </div>

        {/* Right: action buttons — match left width for centering */}
        <div className="w-[76px] flex items-center justify-end gap-0.5">
          <button
            onClick={onNewInstance}
            title="New instance"
            className="flex items-center gap-1 rounded-md bg-white/[0.07] px-2 py-1 text-[10px] text-[#888] hover:bg-white/[0.11] hover:text-[#b0b1b4] transition-all"
          >
            <Plus size={10} />
            New
          </button>
          <button
            onClick={onRefresh}
            title="Refresh"
            className="rounded-md p-1.5 text-[#555] hover:bg-white/[0.07] hover:text-[#888] transition-all"
          >
            <RefreshCw size={11} className={cn(isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Sub-line: context + version, centered */}
      <div className="pb-2 flex items-center justify-center gap-2">
        {activeContext ? (
          <span className="text-[10px] text-[#4a4b50]">
            ctx:{" "}
            <span className="text-[#636470] font-mono">{activeContext.name}</span>
          </span>
        ) : (
          <span className="text-[10px] text-[#3a3b40]">no docker context</span>
        )}
        {version && (
          <>
            <span className="text-[#333]">·</span>
            <span className="text-[10px] text-[#4a4b50] font-mono">
              {version.split("\n")[0].replace("colima version ", "v")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
