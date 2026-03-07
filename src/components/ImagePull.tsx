import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download } from "lucide-react";

interface ImagePullProps {
  profile: string;
  onPulled: () => void;
  onViewLogs: () => void;
}

export function ImagePull({ profile, onPulled, onViewLogs }: ImagePullProps) {
  const [image, setImage] = useState("");
  const [pulling, setPulling] = useState(false);

  const handlePull = async () => {
    const name = image.trim();
    if (!name) return;
    setPulling(true);
    onViewLogs();
    try {
      await invoke("pull_image", { profile, image: name });
      setImage("");
      onPulled();
    } catch {
      // errors show in log drawer
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        value={image}
        onChange={(e) => setImage(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handlePull()}
        placeholder="nginx:latest, postgres:16, redis..."
        className="flex-1 bg-white/[0.04] border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-blue-500/40 transition-colors"
      />
      <button
        onClick={handlePull}
        disabled={!image.trim() || pulling}
        className="flex items-center gap-2 rounded-lg bg-blue-500/15 px-3.5 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download size={13} className={pulling ? "animate-bounce" : ""} />
        {pulling ? "Pulling..." : "Pull"}
      </button>
    </div>
  );
}
