import { ref } from "vue";
import {
  clearConfigOverride,
  disableConfigOverride,
  enableConfigOverride,
  isConfigOverrideEnabled,
  loadConfigOverride,
  saveConfigOverride,
} from "./api";
import type { ConfigOverride } from "../types/app";

const isEnabled = ref(false);
const config = ref<ConfigOverride>({});

export function useConfigOverride() {
  async function loadConfig() {
    const [loadedConfig, enabled] = await Promise.all([
      loadConfigOverride(),
      isConfigOverrideEnabled(),
    ]);

    config.value = loadedConfig;
    isEnabled.value = enabled;
    return loadedConfig;
  }

  async function enableOverride() {
    isEnabled.value = true;
    await enableConfigOverride();
  }

  async function disableOverride() {
    isEnabled.value = false;
    await disableConfigOverride();
  }

  async function saveConfig(newConfig: ConfigOverride) {
    config.value = newConfig;
    await saveConfigOverride(newConfig);
  }

  async function clearConfig() {
    config.value = {};
    await clearConfigOverride();
  }

  return {
    isEnabled,
    config,
    loadConfig,
    enableOverride,
    disableOverride,
    saveConfig,
    clearConfig,
  };
}
