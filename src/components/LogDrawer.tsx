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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ height: 200 }}>
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">
            Output
          </span>
          {isRunningCommand && (
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-fg-faint hover:text-fg-muted transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-xs">
        {logs.length === 0 ? (
          <span className="text-fg-muted">Waiting for output...</span>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "leading-relaxed whitespace-pre-wrap break-all",
                log.isError ? "text-red-400/80" : "text-fg-secondary"
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
