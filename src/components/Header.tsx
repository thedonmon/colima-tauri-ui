import { RefreshCw, Plus } from "lucide-react";
import { useColimaStore } from "../store";
import { cn } from "../lib/utils";

interface HeaderProps {
  onRefresh: () => void;
  onNewInstance: () => void;
}

export function Header({ onRefresh, onNewInstance }: HeaderProps) {
  const { isLoading, version, dockerContexts } = useColimaStore();
  const activeContext = dockerContexts.find((c) => c.current);

  return (
    <div
      className="border-b border-white/8 select-none"
      data-tauri-drag-region
    >
      {/*
       * ── Title-bar row ──────────────────────────────────────────────────────
       * Exactly h-8 (32px) tall. macOS traffic lights sit at x=16, y=16 —
       * centred in this row on the LEFT side. We own the RIGHT side only.
       * The 80px left spacer keeps our buttons away from the traffic lights.
       */}
      <div className="h-8 flex items-center justify-between px-3">
        <div className="w-20 flex-shrink-0" /> {/* traffic-light reserve */}
        <div className="flex items-center gap-1">
          <button
            onClick={onNewInstance}
            title="New instance"
            className="flex items-center gap-1 rounded-md bg-white/8 px-2.5 py-1 text-[11px] text-[#aaaaad] hover:bg-white/12 hover:text-[#c1c2c5] transition-all"
          >
            <Plus size={11} />
            New
          </button>
          <button
            onClick={onRefresh}
            title="Refresh"
            className="rounded-md p-1.5 text-[#888] hover:bg-white/8 hover:text-[#aaaaad] transition-all"
          >
            <RefreshCw size={12} className={cn(isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/*
       * ── Branding + sub-line ────────────────────────────────────────────────
       * Appears below the traffic-light zone. No left-indent needed here
       * because we're now below the traffic lights vertically.
       */}
      <div className="px-4 pb-3 space-y-0.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-[10px] font-bold">C</span>
          </div>
          <span className="text-[13px] font-semibold text-[#e8e8e8]">Colima Manager</span>
        </div>
        <div className="flex items-center gap-2 pl-7">
          {activeContext ? (
            <span className="text-[10px] text-[#777]">
              ctx: <span className="text-[#999] font-mono">{activeContext.name}</span>
            </span>
          ) : (
            <span className="text-[10px] text-[#666]">no docker context</span>
          )}
          {version && (
            <>
              <span className="text-[#555]">·</span>
              <span className="text-[10px] text-[#666] font-mono">
                {version.split("\n")[0].replace("colima version ", "v")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
