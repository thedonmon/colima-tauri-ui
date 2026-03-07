import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Copy, Check } from "lucide-react";

interface ConfigViewerProps {
  profile: string;
  onClose: () => void;
}

export function ConfigViewer({ profile, onClose }: ConfigViewerProps) {
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<string>("read_config", { profile })
      .then((c) => setConfig(c))
      .catch((e) => setError(String(e)));
  }, [profile]);

  const handleCopy = async () => {
    if (!config) return;
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-panel rounded-2xl">
      {/* Traffic-light clearance */}
      <div className="h-9 flex-shrink-0" data-tauri-drag-region />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-fg">colima.yaml</p>
          <p className="text-xs text-fg-muted">~/.colima/{profile}/colima.yaml</p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleCopy}
              className="text-fg-faint hover:text-fg-secondary transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-fg-faint hover:text-fg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : config === null ? (
          <p className="text-sm text-fg-faint">Loading...</p>
        ) : (
          <pre className="text-sm text-fg-secondary font-mono leading-relaxed whitespace-pre-wrap break-all">
            {config}
          </pre>
        )}
      </div>
    </div>
  );
}
