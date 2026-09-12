import { create } from "zustand";
import { AppSettings } from "../types";
import { DEFAULT_SETTINGS, storageService } from "../db/storage";

interface SettingsState {
  settings: AppSettings;
  dataDirectory: string;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  setMockMode: (enabled: boolean) => Promise<void>;
  setDeveloperMode: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  dataDirectory: "获取中...",
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    const settings = await storageService.getSettings();
    const dataDirectory = await storageService.getDbPath();
    set({ settings, dataDirectory, isLoading: false });
  },

  updateSettings: async (updates) => {
    const current = get().settings;
    const updated = { ...current, ...updates };
    await storageService.saveSettings(updated);
    set({ settings: updated });
  },

  setMockMode: async (enabled: boolean) => {
    await get().updateSettings({ mockLlmMode: enabled });
  },

  setDeveloperMode: async (enabled: boolean) => {
    await get().updateSettings({ developerMode: enabled });
  },
}));
