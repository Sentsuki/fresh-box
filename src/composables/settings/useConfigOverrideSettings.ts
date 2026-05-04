import { computed, ref } from "vue";
import { getErrorMessage } from "../../services/tauri";
import { useConfigOverride } from "../../services/configOverride";
import { toast } from "../useToast";

export function useConfigOverrideSettings() {
  const configOverride = useConfigOverride();
  const rawConfig = ref("");
  const jsonError = ref("");

  const isOverrideEnabled = computed({
    get: () => configOverride.isEnabled.value,
    set: (value) => {
      void (value
        ? configOverride.enableOverride()
        : configOverride.disableOverride());
    },
  });

  const overrideConfig = computed({
    get: () => rawConfig.value,
    set: (value: string) => {
      rawConfig.value = value;

      if (!value.trim()) {
        jsonError.value = "";
        configOverride.config.value = {};
        return;
      }

      try {
        configOverride.config.value = JSON.parse(value);
        jsonError.value = "";
      } catch (error) {
        jsonError.value =
          error instanceof SyntaxError ? error.message : "Invalid JSON format";
      }
    },
  });

  const isValidJson = computed(() => jsonError.value === "");

  async function initializeOverride() {
    const loadedConfig = await configOverride.loadConfig();
    if (Object.keys(loadedConfig).length > 0) {
      rawConfig.value = JSON.stringify(loadedConfig, null, 2);
      configOverride.config.value = loadedConfig;
    }
  }

  async function saveOverride() {
    if (!overrideConfig.value.trim()) {
      try {
        await configOverride.clearConfig();
        await configOverride.disableOverride();
        toast.success("Empty configuration - override disabled", "save");
      } catch (error) {
        toast.error(
          `Failed to disable configuration override: ${getErrorMessage(error)}`,
        );
      }
      return;
    }

    if (!isValidJson.value) {
      toast.error("Please fix JSON format errors before saving");
      return;
    }

    try {
      await configOverride.saveConfig(JSON.parse(overrideConfig.value));
      toast.success("Configuration override saved successfully", "save");
    } catch (error) {
      toast.error(
        `Failed to save configuration override: ${getErrorMessage(error)}`,
      );
    }
  }

  async function clearOverride() {
    try {
      await configOverride.clearConfig();
      rawConfig.value = "";
      jsonError.value = "";
      toast.success("Configuration override cleared successfully", "clear");
    } catch (error) {
      toast.error(
        `Failed to clear configuration override: ${getErrorMessage(error)}`,
      );
    }
  }

  return {
    isOverrideEnabled,
    overrideConfig,
    jsonError,
    isValidJson,
    initializeOverride,
    saveOverride,
    clearOverride,
  };
}
