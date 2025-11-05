import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

type ConfigOverride = Record<string, unknown>;

const isEnabled = ref(false);
const config = ref({} as ConfigOverride);

export function useConfigOverride() {
  const enableOverride = async () => {
    isEnabled.value = true;
    await invoke("enable_config_override");
  };

  const disableOverride = async () => {
    isEnabled.value = false;
    await invoke("disable_config_override");
  };

  const saveConfig = async (newConfig: ConfigOverride) => {
    config.value = newConfig;
    await invoke("save_config_override", { config: newConfig });
  };

  const clearConfig = async () => {
    config.value = {};
    await invoke("clear_config_override");
  };

  const loadConfig = async () => {
    try {
      const [loadedConfig, enabled] = await Promise.all([
        invoke<ConfigOverride>("load_config_override"),
        invoke<boolean>("is_config_override_enabled"),
      ]);
      config.value = loadedConfig;
      isEnabled.value = enabled;
    } catch (error) {
      console.error("Failed to load config override:", error);
    }
  };

  // Load config on initialization
  loadConfig();

  return {
    isEnabled,
    config,
    enableOverride,
    disableOverride,
    saveConfig,
    clearConfig,
  };
}
