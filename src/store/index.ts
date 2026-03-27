import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ColimaInstance, StartOptions, LogLine, DockerContext } from "../types";

interface ColimaStore {
  instances: ColimaInstance[];
  dockerContexts: DockerContext[];
  version: string;
  logs: LogLine[];
  isLoading: boolean;
  isRunningCommand: boolean;
  activeProfile: string | null;
  colimaInstalled: boolean | null; // null = not yet checked
  dockerRefreshTick: Record<string, number>; // per-profile tick bumped on docker events

  fetchInstances: () => Promise<void>;
  setInstances: (instances: ColimaInstance[]) => void;
  fetchVersion: () => Promise<void>;
  fetchDockerContexts: () => Promise<void>;
  startInstance: (options: StartOptions) => Promise<void>;
  stopInstance: (profile: string) => Promise<void>;
  restartInstance: (profile: string) => Promise<void>;
  deleteInstance: (profile: string) => Promise<void>;
  pruneInstance: (profile: string) => Promise<void>;
  forceStopInstance: (profile: string) => Promise<void>;
  killStaleProcesses: (profile: string) => Promise<void>;
  lastCommandFailed: boolean;
  addLog: (log: LogLine) => void;
  clearLogs: () => void;
  bumpDockerTick: (profile: string) => void;
}

function isNotFound(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes("colima not found") || msg.includes("no such file") || msg.includes("os error 2");
}

async function runCommand<T>(
  set: (partial: Partial<ColimaStore>) => void,
  profile: string,
  fn: () => Promise<T>,
  onDone?: () => void
): Promise<T> {
  set({ isRunningCommand: true, activeProfile: profile, logs: [], lastCommandFailed: false });
  try {
    const result = await fn();
    onDone?.();
    return result;
  } catch (err) {
    set({ lastCommandFailed: true });
    throw err;
  } finally {
    set({ isRunningCommand: false, activeProfile: null });
  }
}

export const useColimaStore = create<ColimaStore>((set, get) => ({
  instances: [],
  dockerContexts: [],
  version: "",
  logs: [],
  isLoading: false,
  isRunningCommand: false,
  activeProfile: null,
  colimaInstalled: null,
  lastCommandFailed: false,
  dockerRefreshTick: {},

  fetchInstances: async () => {
    set({ isLoading: true });
    try {
      const instances = await invoke<ColimaInstance[]>("list_instances");
      set({ instances, colimaInstalled: true });
    } catch (err) {
      if (isNotFound(err)) {
        set({ instances: [], colimaInstalled: false });
      } else {
        set({ instances: [], colimaInstalled: true });
        console.error("list_instances failed:", err);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // Directly set instances (used by the colima-status-changed event).
  // Poller only fires when colima is running, so it's always installed.
  setInstances: (instances) => set({ instances, colimaInstalled: true }),

  fetchVersion: async () => {
    try {
      const version = await invoke<string>("get_version");
      set({ version, colimaInstalled: true });
    } catch (e) {
      if (isNotFound(e)) set({ colimaInstalled: false });
    }
  },

  fetchDockerContexts: async () => {
    try {
      const dockerContexts = await invoke<DockerContext[]>("get_docker_contexts");
      set({ dockerContexts });
    } catch {}
  },

  startInstance: async (options) => {
    await runCommand(set, options.profile, () => invoke("start_instance", { options }), () =>
      get().fetchInstances()
    );
  },

  stopInstance: async (profile) => {
    await runCommand(set, profile, () => invoke("stop_instance", { profile }), () =>
      get().fetchInstances()
    );
  },

  restartInstance: async (profile) => {
    await runCommand(set, profile, () => invoke("restart_instance", { profile }), () =>
      get().fetchInstances()
    );
  },

  deleteInstance: async (profile) => {
    await runCommand(set, profile, () => invoke("delete_instance", { profile }), () =>
      get().fetchInstances()
    );
  },

  pruneInstance: async (profile) => {
    await runCommand(set, profile, () => invoke("prune_instance", { profile }), () =>
      get().fetchInstances()
    );
  },

  forceStopInstance: async (profile) => {
    await runCommand(set, profile, () => invoke("force_stop_instance", { profile }), () =>
      get().fetchInstances()
    );
  },

  killStaleProcesses: async (profile) => {
    await runCommand(set, profile, async () => {
      await invoke("kill_stale_processes", { profile });
    }, () => get().fetchInstances());
  },

  addLog: (log) =>
    set((state) => ({ logs: [...state.logs.slice(-500), log] })),

  clearLogs: () => set({ logs: [] }),

  bumpDockerTick: (profile) =>
    set((state) => ({
      dockerRefreshTick: {
        ...state.dockerRefreshTick,
        [profile]: (state.dockerRefreshTick[profile] ?? 0) + 1,
      },
    })),
}));
