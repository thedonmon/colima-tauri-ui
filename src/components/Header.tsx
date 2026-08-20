import { useEffect, useRef } from "react";
import { RefreshCw, Plus, Search, X } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useShallow } from "zustand/react/shallow";
import { useColimaStore } from "../store";
import { cn } from "../lib/utils";

interface HeaderProps {
  onRefresh: () => void;
  onNewInstance: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (v: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

/** Floating top toolbar band: traffic-light reserve, identity/search capsule, action capsule. */
export function Header({
  onRefresh,
  onNewInstance,
  searchOpen,
  onSearchOpenChange,
  search,
  onSearchChange,
}: HeaderProps) {
  const { isLoading, version, dockerContexts } = useColimaStore(
    useShallow((s) => ({ isLoading: s.isLoading, version: s.version, dockerContexts: s.dockerContexts }))
  );
  const activeContext = dockerContexts.find((c) => c.current);
  const shortVersion = version
    ? version.split("\n")[0].replace("colima version ", "v")
    : null;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const handleDragMouseDown = async (e: React.MouseEvent) => {
    // Only drag from non-interactive parts of the band.
    if (e.buttons === 1 && !(e.target as HTMLElement).closest("button, input")) {
      const win = getCurrentWebviewWindow();
      await win.startDragging();
    }
  };

  const capsule =
    "h-9 rounded-full bg-surface-raised border border-stroke backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.24)]";

  return (
    <div
      className="absolute top-0 left-0 right-0 h-[52px] flex items-center px-3 gap-2 z-20 select-none"
      data-tauri-drag-region
      onMouseDown={handleDragMouseDown}
    >
      {/* Traffic-light reserve */}
      <div className="w-[64px] flex-shrink-0" />

      {/* Identity / search capsule */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {searchOpen ? (
          <div className={cn(capsule, "flex items-center gap-2 px-3 w-full max-w-[380px]")}>
            <Search size={13} className="text-fg-faint flex-shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onSearchOpenChange(false);
              }}
              placeholder="Search containers, images, volumes"
              className="flex-1 min-w-0 bg-transparent text-xs text-fg placeholder:text-fg-faint outline-none"
            />
            <span className="text-[10px] font-semibold font-mono text-fg-faint bg-surface border border-white/[0.1] rounded-chip px-1 py-0.5 flex-shrink-0">
              esc
            </span>
            <button
              onClick={() => onSearchOpenChange(false)}
              className="text-fg-faint hover:text-fg-muted transition-colors flex-shrink-0"
              title="Close search"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className={cn(capsule, "flex items-center gap-2 px-3.5 min-w-0")}>
            <span className="text-[13px] font-semibold text-fg whitespace-nowrap">Colima</span>
            {activeContext && (
              <>
                <span className="w-[3px] h-[3px] rounded-full bg-white/30 flex-shrink-0" />
                <span className="text-xs text-fg-muted font-mono truncate">
                  ctx: {activeContext.name}
                </span>
              </>
            )}
            {shortVersion && (
              <>
                <span className="w-[3px] h-[3px] rounded-full bg-white/30 flex-shrink-0" />
                <span className="text-xs text-fg-muted font-mono whitespace-nowrap">{shortVersion}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action capsule */}
      <div className={cn(capsule, "flex items-center gap-0.5 px-1 flex-shrink-0")}>
        <button
          onClick={() => onSearchOpenChange(!searchOpen)}
          title="Search (⌘K)"
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-all",
            searchOpen
              ? "bg-surface-hover text-fg"
              : "text-fg-secondary hover:bg-surface-hover"
          )}
        >
          <Search size={13} />
        </button>
        <button
          onClick={onNewInstance}
          title="New instance"
          className="w-7 h-7 rounded-full flex items-center justify-center text-fg-secondary hover:bg-surface-hover transition-all"
        >
          <Plus size={15} />
        </button>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="w-7 h-7 rounded-full flex items-center justify-center text-fg-secondary hover:bg-surface-hover transition-all"
        >
          <RefreshCw size={13} className={cn(isLoading && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}
