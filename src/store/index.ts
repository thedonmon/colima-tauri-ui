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
  activeProfile: string | null; // profile currently running a command

  fetchInstances: () => Promise<void>;
  fetchVersion: () => Promise<void>;
  fetchDockerContexts: () => Promise<void>;
  startInstance: (options: StartOptions) => Promise<void>;
  stopInstance: (profile: string) => Promise<void>;
  restartInstance: (profile: string) => Promise<void>;
  deleteInstance: (profile: string) => Promise<void>;
  pruneInstance: (profile: string) => Promise<void>;
  addLog: (log: LogLine) => void;
  clearLogs: () => void;
}

async function runCommand<T>(
  set: (partial: Partial<ColimaStore>) => void,
  profile: string,
  fn: () => Promise<T>,
  onDone?: () => void
): Promise<T> {
  set({ isRunningCommand: true, activeProfile: profile, logs: [] });
  try {
    const result = await fn();
    onDone?.();
    return result;
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

  fetchInstances: async () => {
    set({ isLoading: true });
    try {
      const instances = await invoke<ColimaInstance[]>("list_instances");
      set({ instances });
    } catch (err) {
      console.error("list_instances failed:", err);
      set({ instances: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchVersion: async () => {
    try {
      const version = await invoke<string>("get_version");
      set({ version });
    } catch {}
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

  addLog: (log) =>
    set((state) => ({ logs: [...state.logs.slice(-500), log] })),

  clearLogs: () => set({ logs: [] }),
}));
