import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, RefreshCw } from "lucide-react";
import { LazyLog } from "@melloware/react-logviewer";
import { cn } from "../lib/utils";
import type { ContainerLogsTarget, ContainerLogLine } from "../types";

interface ContainerLogsDrawerProps {
  target: ContainerLogsTarget;
  onClose: () => void;
}

export function ContainerLogsDrawer({ target, onClose }: ContainerLogsDrawerProps) {
  const [logUrl, setLogUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0); // force LazyLog remount on refresh

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    // revoke previous blob URL
    if (logUrl) URL.revokeObjectURL(logUrl);
    setLogUrl(null);
    try {
      const result = await invoke<ContainerLogLine[]>("get_container_logs", {
        context: target.context,
        containerId: target.container.id,
        tail: 300,
      });
      const text = result.map((l) => l.text).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      setLogUrl(URL.createObjectURL(blob));
      setKey((k) => k + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    return () => {
      if (logUrl) URL.revokeObjectURL(logUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.container.id, target.context]);

  const status = target.container.status ?? "";
  const isUp = status.toLowerCase().startsWith("up");

  return (
    <div className="border-t border-white/8 bg-[#13141a] flex flex-col" style={{ height: 260 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/6 flex-shrink-0">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0",
            isUp ? "bg-green-500" : "bg-[#555]"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#e0e0e0] truncate">
            {target.container.names || target.container.id}
          </p>
          <p className="text-[10px] text-[#444] truncate">{target.container.image}</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          title="Refresh"
          className="text-[#444] hover:text-[#666] transition-colors flex-shrink-0"
        >
          <RefreshCw size={11} className={cn(loading && "animate-spin")} />
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="text-[#444] hover:text-[#666] transition-colors flex-shrink-0"
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 min-h-0">
        {error ? (
          <p className="px-4 pt-2 text-[10.5px] font-mono text-red-400">{error}</p>
        ) : loading && !logUrl ? (
          <p className="px-4 pt-2 text-[10.5px] font-mono text-[#444]">Loading…</p>
        ) : logUrl ? (
          <LazyLog
            key={key}
            url={logUrl}
            follow
            enableSearch
            caseInsensitive
            extraLines={1}
            style={{ background: "transparent", fontSize: 10.5 }}
            lineClassName="text-[#909296] font-mono"
          />
        ) : (
          <p className="px-4 pt-2 text-[10.5px] font-mono text-[#444] italic">No log output found</p>
        )}
      </div>
    </div>
  );
}
