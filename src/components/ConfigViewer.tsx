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
    <div className="absolute inset-0 z-50 flex flex-col bg-[#13141a] rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div>
          <p className="text-[12px] font-semibold text-[#e0e0e0]">colima.yaml</p>
          <p className="text-[10px] text-[#555]">~/.colima/{profile}/colima.yaml</p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleCopy}
              className="text-[#555] hover:text-[#909296] transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[#555] hover:text-[#909296] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="text-[11px] text-red-400">{error}</p>
        ) : config === null ? (
          <p className="text-[11px] text-[#444]">Loading…</p>
        ) : (
          <pre className="text-[11px] text-[#909296] font-mono leading-relaxed whitespace-pre-wrap break-all">
            {config}
          </pre>
        )}
      </div>
    </div>
  );
}
