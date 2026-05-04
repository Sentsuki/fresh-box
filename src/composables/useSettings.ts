import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  checkConfigFields,
  getSingboxCoreStatus,
  getSingboxStatus,
  loadPriorityConfig,
  openAppDirectory,
  refreshSingboxDetection,
  savePriorityConfig,
  updateSingboxCore,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useConfigOverride } from "../services/configOverride";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";
import type {
  ConfigFieldsCheck,
  LogLevel,
  PriorityConfig,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
  StackOption,
} from "../types/app";

const stackOptions: StackOption[] = ["mixed", "gvisor", "system"];
const logLevels: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

export function useSettings() {
  const appStore = useAppStore();
  const configOverride = useConfigOverride();

  const jsonError = ref("");
  const rawConfig = ref("");
  const isRefreshing = ref(false);
  const isGettingStatus = ref(false);
  const processStatus = ref("");
  const isRefreshingCoreStatus = ref(false);
  const isUpdatingCore = ref(false);
  const coreStatus = ref<SingboxCoreStatus | null>(null);
  const coreStatusError = ref("");
  const isLoading = ref(false);
  const enableTransitions = ref(false);
  const selectedStackOption = ref<StackOption>("mixed");
  const hasStackField = ref(false);
  const logDisabled = ref(false);
  const selectedLogLevel = ref<LogLevel>("info");
  const hasLogField = ref(false);

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

  const processStatusClass = computed(() => {
    if (!processStatus.value) {
      return "";
    }

    const normalized = processStatus.value.toLowerCase();
    if (normalized.includes("running") || normalized.includes("detected")) {
      return "status-success";
    }

    if (normalized.includes("failed") || normalized.includes("error")) {
      return "status-error";
    }

    return "status-info";
  });

  const coreStatusText = computed(() => {
    if (isRefreshingCoreStatus.value && !coreStatus.value) {
      return "Checking";
    }

    if (coreStatusError.value) {
      return "Failed";
    }

    if (!coreStatus.value) {
      return "Unknown";
    }

    if (coreStatus.value.is_running && coreStatus.value.update_available) {
      return "Stop Required";
    }

    if (coreStatus.value.is_running) {
      return "Running";
    }

    if (!coreStatus.value.installed) {
      return "Not Installed";
    }

    return coreStatus.value.update_available ? "Update Available" : "Up to Date";
  });

  const coreStatusBadgeClass = computed(() => {
    if (coreStatusError.value) {
      return "bg-red-100 text-red-700";
    }

    if (!coreStatus.value) {
      return "bg-gray-100 text-gray-600";
    }

    if (coreStatus.value.is_running && coreStatus.value.update_available) {
      return "bg-amber-100 text-amber-800";
    }

    if (coreStatus.value.update_available) {
      return "bg-violet-100 text-violet-700";
    }

    return "bg-green-100 text-green-700";
  });

  const updateCoreButtonLabel = computed(() => {
    if (isUpdatingCore.value) {
      return "Updating...";
    }

    if (coreStatus.value?.is_running) {
      return "Download Core";
    }

    if (!coreStatus.value?.installed) {
      return "Install Latest Core";
    }

    return coreStatus.value.update_available
      ? "Update Core"
      : "Reinstall Latest Core";
  });

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
        loadPriorityConfig().catch(() => ({} as PriorityConfig)),
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
      }, 50);
    }
  }

  function applyConfiguration(
    fieldsCheck: ConfigFieldsCheck,
    priorityConfig: PriorityConfig,
  ) {
    hasStackField.value = fieldsCheck.has_stack_field;
    hasLogField.value = fieldsCheck.has_log_field;

    if (fieldsCheck.has_stack_field) {
      const stackValue = priorityConfig.stack || fieldsCheck.current_stack_value;
      if (stackValue && stackOptions.includes(stackValue as StackOption)) {
        selectedStackOption.value = stackValue as StackOption;
      }
    }

    if (fieldsCheck.has_log_field) {
      const logConfig = priorityConfig.log;
      if (logConfig) {
        logDisabled.value = logConfig.disabled;
        if (logLevels.includes(logConfig.level as LogLevel)) {
          selectedLogLevel.value = logConfig.level as LogLevel;
        }
        return;
      }

      logDisabled.value = fieldsCheck.current_log_disabled ?? false;
      if (
        fieldsCheck.current_log_level &&
        logLevels.includes(fieldsCheck.current_log_level as LogLevel)
      ) {
        selectedLogLevel.value = fieldsCheck.current_log_level as LogLevel;
      }
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
      toast.error(`Failed to update stack configuration: ${getErrorMessage(error)}`);
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
      toast.error(`Failed to update log configuration: ${getErrorMessage(error)}`);
    }
  }

  async function setLogLevel(level: LogLevel) {
    selectedLogLevel.value = level;
    await updateLogConfiguration();
  }

  async function refreshCoreStatus(showErrorToast = false) {
    if (isRefreshingCoreStatus.value) {
      return;
    }

    isRefreshingCoreStatus.value = true;
    coreStatusError.value = "";

    try {
      coreStatus.value = await getSingboxCoreStatus();
    } catch (error) {
      coreStatus.value = null;
      coreStatusError.value = getErrorMessage(error);
      if (showErrorToast) {
        toast.error(coreStatusError.value);
      }
    } finally {
      isRefreshingCoreStatus.value = false;
    }
  }

  async function installCoreUpdate() {
    if (isUpdatingCore.value) {
      return;
    }

    isUpdatingCore.value = true;

    try {
      const result: SingboxCoreUpdateResult = await updateSingboxCore();
      toast.success(`Sing-box core updated to ${result.current_version}`);
      await refreshCoreStatus();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      isUpdatingCore.value = false;
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

  async function openApplicationDirectory() {
    try {
      await openAppDirectory();
    } catch (error) {
      toast.error(`Failed to open app directory: ${getErrorMessage(error)}`);
    }
  }

  async function detectManagedProcess() {
    if (isRefreshing.value) {
      return;
    }

    isRefreshing.value = true;
    processStatus.value = "";

    try {
      const hasProcess = await refreshSingboxDetection();
      processStatus.value = hasProcess
        ? "Sing-box process detected and now under management"
        : "No sing-box process found";
    } catch (error) {
      processStatus.value = "Failed to detect sing-box process";
      toast.error(`Failed to detect sing-box process: ${getErrorMessage(error)}`);
    } finally {
      isRefreshing.value = false;
    }
  }

  async function loadManagedProcessStatus() {
    if (isGettingStatus.value) {
      return;
    }

    isGettingStatus.value = true;

    try {
      processStatus.value = await getSingboxStatus();
    } catch (error) {
      processStatus.value = "Failed to get sing-box status";
      toast.error(`Failed to get sing-box status: ${getErrorMessage(error)}`);
    } finally {
      isGettingStatus.value = false;
    }
  }

  async function initialize() {
    const [loadedConfig] = await Promise.all([
      configOverride.loadConfig(),
      loadConfiguration(),
      refreshCoreStatus(),
    ]);

    if (Object.keys(loadedConfig).length > 0) {
      rawConfig.value = JSON.stringify(loadedConfig, null, 2);
      configOverride.config.value = loadedConfig;
    }
  }

  const handleWindowFocus = async () => {
    await loadConfiguration();
  };

  watch(
    () => appStore.selectedConfigPath.value,
    () => {
      void loadConfiguration();
    },
  );

  onMounted(() => {
    void initialize();
    window.addEventListener("focus", handleWindowFocus);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", handleWindowFocus);
  });

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
    isOverrideEnabled,
    overrideConfig,
    jsonError,
    isValidJson,
    isRefreshing,
    isGettingStatus,
    processStatus,
    processStatusClass,
    isRefreshingCoreStatus,
    isUpdatingCore,
    coreStatus,
    coreStatusError,
    coreStatusText,
    coreStatusBadgeClass,
    updateCoreButtonLabel,
    setStackOption,
    updateLogConfiguration,
    setLogLevel,
    saveOverride,
    clearOverride,
    openApplicationDirectory,
    refreshCoreStatus,
    installCoreUpdate,
    detectManagedProcess,
    loadManagedProcessStatus,
  };
}
