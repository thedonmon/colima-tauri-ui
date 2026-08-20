import { invoke as tauriInvoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { DEMO_MODE, demoInvoke } from "./demo";

/**
 * App-wide invoke: the real Tauri IPC normally, the mock-data handlers when
 * launched with VITE_DEMO=1 (`make demo`) — see src/lib/demo.ts.
 */
export const invoke: <T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<T> =
  DEMO_MODE ? demoInvoke : tauriInvoke;
