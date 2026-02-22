import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Database } from "lucide-react";
import type { DockerVolume } from "../types";

interface VolumeRowProps {
  volume: DockerVolume;
  profile: string;
  onRefresh: () => void;
}

export function VolumeRow({ volume, profile, onRefresh }: VolumeRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("remove_volume", { profile, volumeName: volume.name });
      onRefresh();
    } catch (e) {
      setError(String(e).split("\n")[0]);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  // Shorten mountpoint for display — just show the last segment
  const shortMount = volume.mountpoint
    ? volume.mountpoint.split("/").slice(-2).join("/")
    : "";

  return (
    <div className="flex items-center gap-2.5 group">
      <Database size={10} className="text-[#5a5b60] flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <span className="text-[10.5px] font-medium text-[#c0c1c4] truncate block">
          {volume.name}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          {volume.driver !== "local" && (
            <>
              <span className="text-[9.5px] text-[#777] font-mono">{volume.driver}</span>
              <span className="text-[#555]">·</span>
            </>
          )}
          {shortMount && (
            <span className="text-[9px] text-[#666] font-mono truncate" title={volume.mountpoint}>
              …/{shortMount}
            </span>
          )}
        </div>
        {error && <p className="text-[9.5px] text-red-400/70 mt-0.5 leading-snug">{error}</p>}
      </div>

      {/* Remove button */}
      {confirming ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setConfirming(false)}
            className="text-[9.5px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#666] hover:text-[#999] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleRemove}
            disabled={busy}
            className="text-[9.5px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-40"
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#444] hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
          title="Remove volume"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}
