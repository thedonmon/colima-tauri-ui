import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface PruneConfirmModalProps {
  profile: string;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function PruneConfirmModal({ profile, onConfirm, onCancel }: PruneConfirmModalProps) {
  const [dontAsk, setDontAsk] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-overlay">
      <div className="w-80 bg-panel-alt/95 backdrop-blur-xl border border-stroke rounded-panel p-5 shadow-2xl animate-sheet">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 rounded-ctl bg-amber-500/15">
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-fg">Prune "{profile}"</h3>
        </div>

        <p className="text-xs text-fg-muted leading-relaxed mb-1">
          This will delete cached downloaded assets (ISO images, boot files) stored
          in Colima's cache directory. This frees disk space but may slow down the
          next VM start as assets are re-downloaded.
        </p>
        <p className="text-xs text-fg-faint leading-relaxed mb-4">
          Running containers, images, and volumes are <span className="text-fg-muted font-medium">not</span> affected.
        </p>

        <label className="flex items-center gap-2 mb-4 cursor-pointer group">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="rounded border-white/20 bg-white/[0.06] text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 w-3.5 h-3.5"
          />
          <span className="text-xs text-fg-faint group-hover:text-fg-muted transition-colors">
            Don't ask me again
          </span>
        </label>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-full bg-surface-raised text-fg-muted hover:text-fg-secondary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(dontAsk)}
            className="text-xs px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all font-medium"
          >
            Prune
          </button>
        </div>
      </div>
    </div>
  );
}
