import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useColimaStore } from "../store";
import { cn } from "../lib/utils";

interface LogDrawerProps {
  onClose: () => void;
}

export function LogDrawer({ onClose }: LogDrawerProps) {
  const { logs, isRunningCommand } = useColimaStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="border-t border-white/8 bg-[#13141a] flex flex-col" style={{ height: 180 }}>
      {/* Drawer header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
            Output
          </span>
          {isRunningCommand && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#777] transition-colors"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px]">
        {logs.length === 0 ? (
          <span className="text-[#666]">Waiting for output…</span>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "leading-relaxed whitespace-pre-wrap break-all",
                log.isError ? "text-red-400/80" : "text-[#909296]"
              )}
            >
              {log.line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
