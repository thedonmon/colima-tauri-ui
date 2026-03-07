import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface DefaultVmPreset {
  cpu: number;
  memory: number;
  disk: number;
  vmType: string;
  runtime: string;
  rosetta: boolean;
}

export interface AppSettings {
  hideOnFocusLoss: boolean;
  notifications: boolean;
  defaultVmPreset: DefaultVmPreset;
}

const defaults: AppSettings = {
  hideOnFocusLoss: false,
  notifications: true,
  defaultVmPreset: {
    cpu: 4,
    memory: 8,
    disk: 60,
    vmType: "vz",
    runtime: "docker",
    rosetta: true,
  },
};

interface SettingsStore extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaults,
  loaded: false,

  load: async () => {
    try {
      const raw = await invoke<Record<string, unknown>>("load_settings");
      const merged = {
        ...defaults,
        ...raw,
        defaultVmPreset: { ...defaults.defaultVmPreset, ...(raw.defaultVmPreset as Record<string, unknown> ?? {}) },
      };
      set({ ...merged, loaded: true });
    } catch {
      set({ ...defaults, loaded: true });
    }
  },

  update: async (partial) => {
    const current = get();
    const next: AppSettings = {
      hideOnFocusLoss: partial.hideOnFocusLoss ?? current.hideOnFocusLoss,
      notifications: partial.notifications ?? current.notifications,
      defaultVmPreset: partial.defaultVmPreset ?? current.defaultVmPreset,
    };
    set(next);
    try {
      await invoke("save_settings", { settings: next });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },
}));
