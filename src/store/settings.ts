import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  hideOnFocusLoss: boolean;
}

const defaults: AppSettings = {
  hideOnFocusLoss: false,
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
      const merged = { ...defaults, ...raw };
      set({ ...merged, loaded: true });
    } catch {
      set({ ...defaults, loaded: true });
    }
  },

  update: async (partial) => {
    const current = get();
    const next: AppSettings = {
      hideOnFocusLoss: partial.hideOnFocusLoss ?? current.hideOnFocusLoss,
    };
    set(next);
    try {
      await invoke("save_settings", { settings: next });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },
}));
