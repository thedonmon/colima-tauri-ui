import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronDown, Search, X } from "lucide-react";
import AnsiToHtml from "ansi-to-html";
import { cn } from "../lib/utils";
import type { ContainerLogsTarget, ContainerLogLineEvent } from "../types";

const ansiConverter = new AnsiToHtml({
  escapeXML: true,
  fg: "#a0a1a6",
  bg: "transparent",
  newline: false,
});

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

interface LogLine {
  text: string;
  isErr: boolean;
}

interface ContainerLogsDrawerProps {
  target: ContainerLogsTarget;
  onClose: () => void;
}

export function ContainerLogsDrawer({ target, onClose }: ContainerLogsDrawerProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const containerId = target.container.id;
    setLines([]);
    setLoading(true);
    setError(null);
    setSearch("");
    setShowSearch(false);

    invoke("stream_container_logs", {
      context: target.context,
      containerId,
      tail: 300,
    }).catch((e) => {
      setError(String(e));
      setLoading(false);
    });

    const unlisten = listen<ContainerLogLineEvent>("container-log-line", (e) => {
      if (e.payload.containerId !== containerId) return;
      setLoading(false);
      setLines((prev) => [
        ...prev.slice(-2000),
        { text: e.payload.text, isErr: e.payload.isErr },
      ]);
    });

    return () => {
      unlisten.then((f) => f());
      invoke("stop_container_log_stream", { containerId }).catch(() => {});
    };
  }, [target.container.id, target.context]);

  useEffect(() => {
    if (!search) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, search]);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
    else setSearch("");
  }, [showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) setShowSearch(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch]);

  const displayLines = useMemo(() => {
    if (!search) return lines;
    const q = search.toLowerCase();
    return lines.filter((l) => stripAnsi(l.text).toLowerCase().includes(q));
  }, [lines, search]);

  const status = target.container.status ?? "";
  const isUp = status.toLowerCase().startsWith("up");

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ height: 280 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle flex-shrink-0">
        <span
          className={cn(
            "h-2 w-2 rounded-full flex-shrink-0",
            isUp ? "bg-green-500" : "bg-fg-faint"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg truncate">
            {target.container.names || target.container.id}
          </p>
          <p className="text-xs text-fg-muted truncate">{target.container.image}</p>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-1.5">
            <Search size={12} className="text-fg-faint flex-shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="bg-transparent text-xs text-fg placeholder-fg-faint outline-none w-32"
            />
            {search && (
              <span className="text-xs text-fg-faint flex-shrink-0">
                {displayLines.length}
              </span>
            )}
          </div>
        )}

        {isUp && !showSearch && (
          <span className="flex items-center gap-1.5 text-xs text-green-500/60">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500/60 animate-pulse" />
            live
          </span>
        )}

        <button
          onClick={() => setShowSearch((v) => !v)}
          title="Search (Cmd+F)"
          className={cn(
            "flex-shrink-0 transition-colors",
            showSearch ? "text-fg-muted" : "text-fg-faint hover:text-fg-muted"
          )}
        >
          {showSearch ? <X size={13} /> : <Search size={13} />}
        </button>

        <button
          onClick={onClose}
          title="Close"
          className="text-fg-faint hover:text-fg-muted transition-colors flex-shrink-0"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-px font-mono text-xs min-h-0">
        {error ? (
          <p className="text-red-400 p-1">{error}</p>
        ) : loading && displayLines.length === 0 ? (
          <p className="text-fg-muted p-1">Connecting...</p>
        ) : displayLines.length === 0 ? (
          <p className="text-fg-muted italic p-1">
            {search ? "No matching lines" : "No log output"}
          </p>
        ) : (
          displayLines.map((line, i) => (
            <LogLineRow key={i} line={line} isMatch={!!search} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogLineRow({ line, isMatch }: { line: LogLine; isMatch: boolean }) {
  let html: string;
  try {
    html = ansiConverter.toHtml(line.text);
  } catch {
    html = line.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return (
    <div
      className={cn(
        "leading-relaxed whitespace-pre-wrap break-all px-1.5 rounded",
        line.isErr ? "text-red-400/80" : "",
        isMatch && "bg-yellow-500/[0.07] border-l-2 border-yellow-500/30 pl-2.5"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
