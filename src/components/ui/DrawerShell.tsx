import { useRef, useState, type ReactNode, type PointerEvent } from "react";

const MIN_HEIGHT = 140;

interface DrawerShellProps {
  initialHeight: number;
  children: ReactNode;
}

/**
 * Shared glass bottom drawer: panel radius on the top corners, floating-panel
 * stroke, single upward shadow, and a grab handle that drag-resizes the height.
 */
export function DrawerShell({ initialHeight, children }: DrawerShellProps) {
  const [height, setHeight] = useState(initialHeight);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startH: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (e.buttons === 0) {
      drag.current = null;
      return;
    }
    const maxH = Math.round(window.innerHeight * 0.7);
    const next = drag.current.startH + (drag.current.startY - e.clientY);
    setHeight(Math.min(Math.max(next, MIN_HEIGHT), maxH));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="relative flex flex-col flex-shrink-0 rounded-t-panel border-t border-stroke border-x border-x-white/10 bg-panel/90 backdrop-blur-xl shadow-[0_-12px_32px_rgba(0,0,0,0.35)] animate-sheet overflow-hidden"
      style={{ height }}
    >
      <div
        className="flex justify-center py-1.5 cursor-row-resize touch-none select-none flex-shrink-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to resize"
      >
        <div className="w-9 h-1 rounded-full bg-white/[0.18]" />
      </div>
      {children}
    </div>
  );
}
