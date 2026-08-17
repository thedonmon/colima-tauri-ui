import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface AdaptivePollOptions {
  /** Interval while the window has focus. */
  focused?: number;
  /** Interval while the window is visible but unfocused. */
  unfocused?: number;
}

/**
 * Self-rescheduling poll whose rate follows what the user can actually see.
 *
 * Two properties matter here:
 *
 * 1. The next tick is only scheduled once the previous call settles, so a slow or
 *    wedged backend can never stack pending invokes on top of each other.
 * 2. The rate adapts. `docker stats --no-stream` costs roughly a second of VM CPU
 *    per call, so a window sitting unfocused in the background at full rate burns
 *    a meaningful slice of a vCPU forever. Checking `visibilityState` alone does
 *    not catch that — it only reports "hidden" once the window is minimised or
 *    hidden to the tray, not when it is merely unfocused behind other windows.
 *
 * Focus regain polls immediately rather than making the user wait out a
 * background-length interval to stop looking at stale numbers.
 */
export function useAdaptivePoll(
  poll: () => Promise<void>,
  { focused = 5000, unfocused = 30000 }: AdaptivePollOptions = {}
) {
  // Kept in a ref so a changing callback (new profile, say) is picked up by the
  // next tick without tearing down and restarting the loop.
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let hasFocus = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        if (document.visibilityState !== "hidden") {
          await pollRef.current();
        }
      } finally {
        running = false;
        if (!cancelled) {
          timer = setTimeout(tick, hasFocus ? focused : unfocused);
        }
      }
    };

    tick();

    const unlisten = getCurrentWebviewWindow().onFocusChanged(({ payload }) => {
      const regained = payload && !hasFocus;
      hasFocus = payload;
      // A tick already in flight will reschedule itself at the new rate, so only
      // jump the queue when the loop is idle and waiting out a long interval.
      if (regained && !cancelled && !running) {
        if (timer) clearTimeout(timer);
        tick();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unlisten.then((f) => f());
    };
  }, [focused, unfocused]);
}
