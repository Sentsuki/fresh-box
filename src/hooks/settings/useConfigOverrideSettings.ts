import { useState, useCallback } from "react";
import { getErrorMessage } from "../../services/tauri";
import { useConfigOverride } from "../../services/configOverride";
import { toast } from "../useToast";

export function useConfigOverrideSettings() {
  const configOverride = useConfigOverride();
  const [rawConfig, setRawConfig] = useState("");
  const [jsonError, setJsonError] = useState("");

  const isOverrideEnabled = configOverride.isEnabled;
  const setOverrideEnabled = useCallback((value: boolean) => {
    void (value ? configOverride.enableOverride() : configOverride.disableOverride());
  }, [configOverride]);

  const setOverrideConfig = useCallback((value: string) => {
    setRawConfig(value);

    if (!value.trim()) {
      setJsonError("");
      return;
    }

    try {
      JSON.parse(value);
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof SyntaxError ? error.message : "Invalid JSON format");
    }
  }, []);

  const isValidJson = jsonError === "";

  const initializeOverride = useCallback(async () => {
    const loadedConfig = await configOverride.loadConfig();
    if (Object.keys(loadedConfig).length > 0) {
      setRawConfig(JSON.stringify(loadedConfig, null, 2));
    }
  }, [configOverride]);

  const saveOverride = useCallback(async () => {
    if (!rawConfig.trim()) {
      try {
        await configOverride.clearConfig();
        await configOverride.disableOverride();
        toast.success("Empty configuration - override disabled");
      } catch (error) {
        toast.error(`Failed to disable configuration override: ${getErrorMessage(error)}`);
      }
      return;
    }

    if (!isValidJson) {
      toast.error("Please fix JSON format errors before saving");
      return;
    }

    try {
      const parsedConfig = JSON.parse(rawConfig);
      await configOverride.saveConfig(parsedConfig);
      toast.success("Configuration override saved successfully");
    } catch (error) {
      toast.error(`Failed to save configuration override: ${getErrorMessage(error)}`);
    }
  }, [rawConfig, isValidJson, configOverride]);

  const clearOverride = useCallback(async () => {
    try {
      await configOverride.clearConfig();
      setRawConfig("");
      setJsonError("");
      toast.success("Configuration override cleared successfully");
    } catch (error) {
      toast.error(`Failed to clear configuration override: ${getErrorMessage(error)}`);
    }
  }, [configOverride]);

  return {
    isOverrideEnabled,
    setOverrideEnabled,
    overrideConfig: rawConfig,
    setOverrideConfig,
    jsonError,
    isValidJson,
    initializeOverride,
    saveOverride,
    clearOverride,
  };
}
