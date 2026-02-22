import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Box } from "lucide-react";
import { cn } from "../lib/utils";
import type { DockerImage } from "../types";

interface ImageRowProps {
  image: DockerImage;
  profile: string;
  onRefresh: () => void;
}

export function ImageRow({ image, profile, onRefresh }: ImageRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNone = image.repository === "<none>" || image.tag === "<none>";
  const label = isNone ? "<none>" : `${image.repository}:${image.tag}`;

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("remove_image", { profile, imageId: image.id });
      onRefresh();
    } catch (e) {
      setError(String(e).split("\n")[0]);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 group">
      <Box size={10} className="text-[#5a5b60] flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[10.5px] font-medium truncate",
              isNone ? "text-[#777] italic" : "text-[#c0c1c4]"
            )}
          >
            {label}
          </span>
          <span className="text-[9px] font-mono text-[#666] flex-shrink-0">{image.id.slice(0, 12)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9.5px] text-[#777]">{image.size}</span>
          <span className="text-[#555]">·</span>
          <span className="text-[9.5px] text-[#777]">{image.created_since}</span>
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
          title="Remove image"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}
