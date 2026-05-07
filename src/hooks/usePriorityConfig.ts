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
  ClashApiConfig,
  ConfigFieldsCheck,
  LogLevel,
  PriorityConfig,
  StackOption,
} from "../types/app";

const STACK_OPTIONS: StackOption[] = ["mixed", "gvisor", "system"];
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
  return STACK_OPTIONS.includes(value as StackOption);
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
  const [testUrl, setTestUrl] = useState("");

  const selectedConfigPath = useSettingsStore(
    (s) => s.settings.app.selected_config_path,
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
          loadPriorityConfig(),
        ]);

      setHasStackField(fieldsCheck.has_stack_field);
      setHasLogField(fieldsCheck.has_log_field);

      if (fieldsCheck.has_stack_field) {
        const stackValue =
          priorityConfig.stack ?? fieldsCheck.current_stack_value;
        if (stackValue && isStackOption(stackValue)) {
          setSelectedStack(stackValue);
        }
      }

      if (fieldsCheck.has_log_field) {
        const logConfig = priorityConfig.log;
        if (logConfig) {
          setLogDisabled(logConfig.disabled);
          if (isLogLevel(logConfig.level)) {
            setSelectedLogLevel(logConfig.level);
          }
        } else {
          setLogDisabled(fieldsCheck.current_log_disabled ?? false);
          if (
            fieldsCheck.current_log_level &&
            isLogLevel(fieldsCheck.current_log_level)
          ) {
            setSelectedLogLevel(fieldsCheck.current_log_level);
          }
        }
      }

      setClashApiController(priorityConfig.clash_api?.external_controller ?? "");
      setClashApiSecret(priorityConfig.clash_api?.secret ?? "");
      setTestUrl(priorityConfig.test_url ?? "");
    } catch (err) {
      setHasStackField(false);
      setHasLogField(false);
      toastError(`Failed to load configuration: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedConfigPath, toastError]);

  const updatePriorityConfig = useCallback(
    async (partial: PriorityConfig) => {
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
        await updatePriorityConfig({ stack: option });
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
    async (config: ClashApiConfig, newTestUrl?: string) => {
      try {
        const current = await loadPriorityConfig();
        const updated: PriorityConfig = {
          ...current,
          clash_api: config,
          ...(newTestUrl !== undefined ? { test_url: newTestUrl } : {}),
        };
        await savePriorityConfig(updated);
        const coreConfig = await getCoreClientConfig();
        updateCoreClientConfig(coreConfig);
        success("Clash API settings saved.");
      } catch (err) {
        toastError(`Failed to update Clash API config: ${getErrorMessage(err)}`);
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
    testUrl,
    setTestUrl,
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
