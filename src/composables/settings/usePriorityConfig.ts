import { ref } from "vue";
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
  const appStore = useAppStore();
  const isLoading = ref(false);
  const enableTransitions = ref(false);
  const selectedStackOption = ref<StackOption>("mixed");
  const hasStackField = ref(false);
  const logDisabled = ref(false);
  const selectedLogLevel = ref<LogLevel>("info");
  const hasLogField = ref(false);

  function applyConfiguration(
    fieldsCheck: ConfigFieldsCheck,
    priorityConfig: PriorityConfig,
  ) {
    hasStackField.value = fieldsCheck.has_stack_field;
    hasLogField.value = fieldsCheck.has_log_field;

    if (fieldsCheck.has_stack_field) {
      const stackValue =
        priorityConfig.stack || fieldsCheck.current_stack_value;
      if (stackValue && isStackOption(stackValue)) {
        selectedStackOption.value = stackValue;
      }
    }

    if (fieldsCheck.has_log_field) {
      const logConfig = priorityConfig.log;
      if (logConfig) {
        logDisabled.value = logConfig.disabled;
        if (isLogLevel(logConfig.level)) {
          selectedLogLevel.value = logConfig.level;
        }
        return;
      }

      logDisabled.value = fieldsCheck.current_log_disabled ?? false;
      if (
        fieldsCheck.current_log_level &&
        isLogLevel(fieldsCheck.current_log_level)
      ) {
        selectedLogLevel.value = fieldsCheck.current_log_level;
      }
    }
  }

  async function loadConfiguration() {
    isLoading.value = true;
    enableTransitions.value = false;

    try {
      const selectedConfig = appStore.selectedConfigPath.value;
      if (!selectedConfig) {
        hasStackField.value = false;
        hasLogField.value = false;
        return;
      }

      const [fieldsCheck, priorityConfig] = await Promise.all([
        checkConfigFields(selectedConfig),
        loadPriorityConfig(),
      ]);

      applyConfiguration(fieldsCheck, priorityConfig);
    } catch (error) {
      hasStackField.value = false;
      hasLogField.value = false;
      toast.error(`Failed to load configuration: ${getErrorMessage(error)}`);
    } finally {
      isLoading.value = false;
      window.setTimeout(() => {
        enableTransitions.value = true;
      }, ENABLE_TRANSITIONS_DELAY_MS);
    }
  }

  async function updatePriorityConfig(partialConfig: PriorityConfig) {
    const priorityConfig = await loadPriorityConfig();
    await savePriorityConfig({
      ...priorityConfig,
      ...partialConfig,
    });
  }

  async function setStackOption(option: StackOption) {
    selectedStackOption.value = option;

    if (!hasStackField.value) {
      return;
    }

    try {
      await updatePriorityConfig({ stack: option });
      toast.success(`Stack option updated to: ${option}`);
    } catch (error) {
      toast.error(
        `Failed to update stack configuration: ${getErrorMessage(error)}`,
      );
    }
  }

  async function updateLogConfiguration() {
    if (!hasLogField.value) {
      return;
    }

    try {
      await updatePriorityConfig({
        log: {
          disabled: logDisabled.value,
          level: selectedLogLevel.value,
        },
      });

      toast.success(
        `Log configuration updated: level=${selectedLogLevel.value}, disabled=${logDisabled.value}`,
      );
    } catch (error) {
      toast.error(
        `Failed to update log configuration: ${getErrorMessage(error)}`,
      );
    }
  }

  async function setLogLevel(level: LogLevel) {
    selectedLogLevel.value = level;
    await updateLogConfiguration();
  }

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
  };
}
