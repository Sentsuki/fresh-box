import { useState, useCallback } from "react";
import {
  checkConfigFields,
  loadPriorityConfig,
  savePriorityConfig,
} from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../useToast";
import type {
  ConfigFieldsCheck,
  LogLevel,
  PriorityConfig,
  StackOption,
} from "../../types/app";

const ENABLE_TRANSITIONS_DELAY_MS = 50;

export const stackOptions: StackOption[] = ["mixed", "gvisor", "system"];
export const logLevels: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

function isStackOption(value: string): value is StackOption {
  return stackOptions.includes(value as StackOption);
}

function isLogLevel(value: string): value is LogLevel {
  return logLevels.includes(value as LogLevel);
}

export function usePriorityConfig() {
  const [isLoading, setIsLoading] = useState(false);
  const [enableTransitions, setEnableTransitions] = useState(false);
  const [selectedStackOption, setSelectedStackOption] = useState<StackOption>("mixed");
  const [hasStackField, setHasStackField] = useState(false);
  const [logDisabled, setLogDisabled] = useState(false);
  const [selectedLogLevel, setSelectedLogLevel] = useState<LogLevel>("info");
  const [hasLogField, setHasLogField] = useState(false);

  const applyConfiguration = useCallback((
    fieldsCheck: ConfigFieldsCheck,
    priorityConfig: PriorityConfig,
  ) => {
    setHasStackField(fieldsCheck.has_stack_field);
    setHasLogField(fieldsCheck.has_log_field);

    if (fieldsCheck.has_stack_field) {
      const stackValue = priorityConfig.stack || fieldsCheck.current_stack_value;
      if (stackValue && isStackOption(stackValue)) {
        setSelectedStackOption(stackValue);
      }
    }

    if (fieldsCheck.has_log_field) {
      const logConfig = priorityConfig.log;
      if (logConfig) {
        setLogDisabled(logConfig.disabled);
        if (isLogLevel(logConfig.level)) {
          setSelectedLogLevel(logConfig.level);
        }
        return;
      }

      setLogDisabled(fieldsCheck.current_log_disabled ?? false);
      if (fieldsCheck.current_log_level && isLogLevel(fieldsCheck.current_log_level)) {
        setSelectedLogLevel(fieldsCheck.current_log_level);
      }
    }
  }, []);

  const loadConfiguration = useCallback(async () => {
    setIsLoading(true);
    setEnableTransitions(false);

    try {
      const selectedConfig = useAppStore.getState().appSettings.app.selected_config_path;
      if (!selectedConfig) {
        setHasStackField(false);
        setHasLogField(false);
        return;
      }

      const [fieldsCheck, priorityConfig] = await Promise.all([
        checkConfigFields(selectedConfig),
        loadPriorityConfig(),
      ]);

      applyConfiguration(fieldsCheck, priorityConfig);
    } catch (error) {
      setHasStackField(false);
      setHasLogField(false);
      toast.error(`Failed to load configuration: ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
      window.setTimeout(() => {
        setEnableTransitions(true);
      }, ENABLE_TRANSITIONS_DELAY_MS);
    }
  }, [applyConfiguration]);

  const updatePriorityConfig = useCallback(async (partialConfig: PriorityConfig) => {
    const priorityConfig = await loadPriorityConfig();
    await savePriorityConfig({
      ...priorityConfig,
      ...partialConfig,
    });
  }, []);

  const setStackOption = useCallback(async (option: StackOption) => {
    setSelectedStackOption(option);

    if (!hasStackField) {
      return;
    }

    try {
      await updatePriorityConfig({ stack: option });
      toast.success(`Stack option updated to: ${option}`);
    } catch (error) {
      toast.error(`Failed to update stack configuration: ${getErrorMessage(error)}`);
    }
  }, [hasStackField, updatePriorityConfig]);

  const updateLogConfiguration = useCallback(async () => {
    if (!hasLogField) {
      return;
    }

    try {
      await updatePriorityConfig({
        log: {
          disabled: logDisabled,
          level: selectedLogLevel,
        },
      });

      toast.success(`Log configuration updated: level=${selectedLogLevel}, disabled=${logDisabled}`);
    } catch (error) {
      toast.error(`Failed to update log configuration: ${getErrorMessage(error)}`);
    }
  }, [hasLogField, logDisabled, selectedLogLevel, updatePriorityConfig]);

  const setLogLevel = useCallback(async (level: LogLevel) => {
    setSelectedLogLevel(level);
    if (!hasLogField) {
      return;
    }
    try {
      await updatePriorityConfig({
        log: { disabled: logDisabled, level },
      });
      toast.success(`Log configuration updated: level=${level}, disabled=${logDisabled}`);
    } catch (error) {
      toast.error(`Failed to update log configuration: ${getErrorMessage(error)}`);
    }
  }, [hasLogField, logDisabled, updatePriorityConfig]);
  
  const toggleLogDisabled = useCallback(async (disabled: boolean) => {
    setLogDisabled(disabled);
    if (!hasLogField) return;
    try {
      await updatePriorityConfig({
        log: { disabled, level: selectedLogLevel },
      });
      toast.success(`Log configuration updated: level=${selectedLogLevel}, disabled=${disabled}`);
    } catch (error) {
      toast.error(`Failed to update log configuration: ${getErrorMessage(error)}`);
    }
  }, [hasLogField, selectedLogLevel, updatePriorityConfig]);

  return {
    stackOptions,
    logLevels,
    isLoading,
    enableTransitions,
    selectedStackOption,
    hasStackField,
    logDisabled,
    selectedLogLevel,
    hasLogField,
    loadConfiguration,
    setStackOption,
    updateLogConfiguration,
    setLogLevel,
    toggleLogDisabled,
  };
}
