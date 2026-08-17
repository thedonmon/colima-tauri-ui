import { useEffect, useRef } from "react";

/**
 * Self-rescheduling poll shared by the stats panels.
 *
 * The next tick is only scheduled once the previous call settles, so a slow or
 * wedged backend can never stack pending invokes on top of each other. Polling is
 * skipped entirely while the window is hidden to the tray.
 *
 * The default interval is deliberately unhurried: `docker stats --no-stream`
 * costs roughly a second of guest CPU per call (measured as a /proc/stat delta
 * inside the VM), so a tight loop here burns a real slice of a vCPU for as long
 * as the panel is open.
 *
 * An earlier version varied the rate with window focus, to also back off while
 * the window sat unfocused in the background. That needs a focus listener, an
 * async seed of the initial focus state, and an immediate-poll-on-regain path —
 * and none of it could be verified from a headless environment. It bought about
 * six percent of one vCPU. Not worth three new failure modes on the path that
 * every stats panel depends on.
 */
export function useAdaptivePoll(poll: () => Promise<void>, intervalMs = 10_000) {
  // Kept in a ref so a changing callback (a new profile, say) is picked up by the
  // next tick without tearing down and restarting the loop.
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      try {
        if (document.visibilityState !== "hidden") {
          await pollRef.current();
        }
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);
}
