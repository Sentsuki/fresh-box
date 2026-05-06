import { create } from 'zustand';
import {
  clearConfigOverride,
  disableConfigOverride,
  enableConfigOverride,
  isConfigOverrideEnabled,
  loadConfigOverride,
  saveConfigOverride,
} from "./api";
import type { ConfigOverride } from "../types/app";

interface ConfigOverrideState {
  isEnabled: boolean;
  config: ConfigOverride;
  loadConfig: () => Promise<ConfigOverride>;
  enableOverride: () => Promise<void>;
  disableOverride: () => Promise<void>;
  saveConfig: (newConfig: ConfigOverride) => Promise<void>;
  clearConfig: () => Promise<void>;
}

export const useConfigOverrideStore = create<ConfigOverrideState>((set) => ({
  isEnabled: false,
  config: {},
  loadConfig: async () => {
    const [loadedConfig, enabled] = await Promise.all([
      loadConfigOverride(),
      isConfigOverrideEnabled(),
    ]);
    set({ config: loadedConfig, isEnabled: enabled });
    return loadedConfig;
  },
  enableOverride: async () => {
    set({ isEnabled: true });
    await enableConfigOverride();
  },
  disableOverride: async () => {
    set({ isEnabled: false });
    await disableConfigOverride();
  },
  saveConfig: async (newConfig: ConfigOverride) => {
    set({ config: newConfig });
    await saveConfigOverride(newConfig);
  },
  clearConfig: async () => {
    set({ config: {} });
    await clearConfigOverride();
  },
}));

export function useConfigOverride() {
  return useConfigOverrideStore();
}
