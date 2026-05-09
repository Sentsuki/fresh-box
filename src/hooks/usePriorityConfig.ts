import { useCallback, useState } from "react";
import {
  checkConfigFields,
  loadPriorityConfig,
  savePriorityConfig,
  generateRandomPort,
  generateRandomSecret,
  getCoreClientConfig,
} from "../services/api";
import { updateCoreClientConfig } from "../services/coreClient";
import { getErrorMessage } from "../services/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";
import type {
  LogLevel,
  PriorityConfig,
  PriorityClashApiConfig,
  ConfigFieldsCheck,
} from "../types/app";

const STACK_OPTIONS = ["mixed", "gvisor", "system"] as const;
export type StackOption = (typeof STACK_OPTIONS)[number];

const LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

function isStackOption(value: string): value is StackOption {
  return (STACK_OPTIONS as readonly string[]).includes(value);
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

export { STACK_OPTIONS, LOG_LEVELS };

export function usePriorityConfig() {
  const [isLoading, setIsLoading] = useState(false);
  const [hasStackField, setHasStackField] = useState(false);
  const [hasLogField, setHasLogField] = useState(false);
  const [selectedStack, setSelectedStack] = useState<StackOption>("mixed");
  const [logDisabled, setLogDisabled] = useState(false);
  const [selectedLogLevel, setSelectedLogLevel] = useState<LogLevel>("info");
  const [clashApiController, setClashApiController] = useState("");
  const [clashApiSecret, setClashApiSecret] = useState("");

  const selectedConfigPath = useSettingsStore(
    (s) => s.settings.Profiles.selected_config_path,
  );
  const { success, error: toastError } = useToast();

  const loadConfiguration = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!selectedConfigPath) {
        setHasStackField(false);
        setHasLogField(false);
        return;
      }
      const [fieldsCheck, priorityConfig]: [ConfigFieldsCheck, PriorityConfig] =
        await Promise.all([
          checkConfigFields(selectedConfigPath),
          loadPriorityConfig(), // backend always returns defaults, never null fields
        ]);

      setHasStackField(fieldsCheck.has_stack_field);
      setHasLogField(fieldsCheck.has_log_field);

      // Stack: Use value from priority_config
      if (fieldsCheck.has_stack_field) {
        const stackValue = priorityConfig.inbounds?.[0]?.stack;
        if (stackValue && isStackOption(stackValue)) {
          setSelectedStack(stackValue);
        }
      }

      // Log: Use value from priority_config (guaranteed by backend defaults)
      if (priorityConfig.log) {
        setLogDisabled(priorityConfig.log.disabled);
        if (isLogLevel(priorityConfig.log.level)) {
          setSelectedLogLevel(priorityConfig.log.level as LogLevel);
        }
      }

      // Clash API: priority_config.experimental.clash_api
      const clashApi = priorityConfig.experimental?.clash_api;
      setClashApiController(clashApi?.external_controller ?? "");
      setClashApiSecret(clashApi?.secret ?? "");
    } catch (err) {
      setHasStackField(false);
      setHasLogField(false);
      toastError(`Failed to load configuration: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedConfigPath, toastError]);

  const updatePriorityConfig = useCallback(
    async (partial: Partial<PriorityConfig>) => {
      const current = await loadPriorityConfig();
      await savePriorityConfig({ ...current, ...partial });
    },
    [],
  );

  const setStackOption = useCallback(
    async (option: StackOption) => {
      setSelectedStack(option);
      if (!hasStackField) return;
      try {
        await updatePriorityConfig({ inbounds: [{ stack: option }] });
        success(`Stack option updated to: ${option}`);
      } catch (err) {
        toastError(`Failed to update stack: ${getErrorMessage(err)}`);
      }
    },
    [hasStackField, updatePriorityConfig, success, toastError],
  );

  const updateLogConfiguration = useCallback(
    async (disabled: boolean, level: LogLevel) => {
      if (!hasLogField) return;
      try {
        await updatePriorityConfig({ log: { disabled, level } });
        success(`Log updated: level=${level}, disabled=${String(disabled)}`);
      } catch (err) {
        toastError(`Failed to update log config: ${getErrorMessage(err)}`);
      }
    },
    [hasLogField, updatePriorityConfig, success, toastError],
  );

  const updateClashApiConfig = useCallback(
    async (config: PriorityClashApiConfig) => {
      try {
        const current = await loadPriorityConfig();
        const updated: PriorityConfig = {
          ...current,
          experimental: {
            ...current.experimental,
            clash_api: config,
          },
        };
        await savePriorityConfig(updated);
        const coreConfig = await getCoreClientConfig();
        updateCoreClientConfig(coreConfig);
        success("Clash API settings saved.");
      } catch (err) {
        toastError(
          `Failed to update Clash API config: ${getErrorMessage(err)}`,
        );
      }
    },
    [success, toastError],
  );

  const genRandomPort = useCallback(async () => {
    try {
      const port = await generateRandomPort();
      const newController = `127.0.0.1:${port}`;
      setClashApiController(newController);
      return newController;
    } catch (err) {
      toastError(`Failed to generate port: ${getErrorMessage(err)}`);
      return null;
    }
  }, [toastError]);

  const genRandomSecret = useCallback(async () => {
    try {
      const secret = await generateRandomSecret();
      setClashApiSecret(secret);
      return secret;
    } catch (err) {
      toastError(`Failed to generate secret: ${getErrorMessage(err)}`);
      return null;
    }
  }, [toastError]);

  return {
    isLoading,
    hasStackField,
    hasLogField,
    selectedStack,
    logDisabled,
    setLogDisabled,
    selectedLogLevel,
    setSelectedLogLevel,
    clashApiController,
    setClashApiController,
    clashApiSecret,
    setClashApiSecret,
    stackOptions: STACK_OPTIONS,
    logLevels: LOG_LEVELS,
    loadConfiguration,
    setStackOption,
    updateLogConfiguration,
    updateClashApiConfig,
    genRandomPort,
    genRandomSecret,
  };
}
