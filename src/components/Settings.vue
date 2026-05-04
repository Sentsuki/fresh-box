<template>
  <div class="content-card">
    <Toast ref="toastRef" />
    <div class="card-header">
      <h2>Settings</h2>
    </div>

    <div class="card-content">
      <div class="settings-section">
        <h3>Configuration</h3>

        <!-- Stack Configuration -->
        <div v-if="hasStackField || isLoading" class="setting-item-vertical">
          <span class="text-base text-gray-700 font-medium mb-3 block"
            >Stack</span
          >
          <div
            v-if="isLoading"
            class="segmented-control stack-segmented-control"
          >
            <div class="segmented-control-track">
              <div class="animate-pulse bg-gray-300 rounded-md h-9" />
            </div>
          </div>
          <div v-else class="segmented-control stack-segmented-control">
            <div class="segmented-control-track">
              <div
                class="segmented-control-indicator"
                :class="{ 'no-transition': !enableTransitions }"
                :style="{
                  left: `calc(3px + ${stackOptions.indexOf(selectedStackOption)} * (100% - 6px) / ${stackOptions.length})`,
                  width: `calc((100% - 6px) / ${stackOptions.length})`,
                }"
              />
              <button
                v-for="option in stackOptions"
                :key="option"
                class="segmented-control-option"
                :class="{ active: selectedStackOption === option }"
                @click="setStackOption(option)"
              >
                {{ option.charAt(0).toUpperCase() + option.slice(1) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Log Configuration -->
        <div v-if="hasLogField || isLoading" class="setting-item-vertical">
          <span class="text-base text-gray-700 font-medium">Log</span>

          <div v-if="isLoading" class="mt-3">
            <!-- Loading placeholder for toggle -->
            <div class="log-toggle-row">
              <span class="text-sm text-gray-600 font-medium"
                >Disable Logging</span
              >
              <div class="animate-pulse bg-gray-300 rounded-full w-9 h-5" />
            </div>
            <!-- Loading placeholder for segmented control -->
            <div class="log-level-section">
              <span class="text-sm text-gray-600 font-medium mb-3 block"
                >Level</span
              >
              <div class="segmented-control log-segmented-control">
                <div class="segmented-control-track">
                  <div class="animate-pulse bg-gray-300 rounded-md h-8" />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="mt-3">
            <!-- Disable Logging Toggle -->
            <div class="log-toggle-row">
              <span class="text-sm text-gray-600 font-medium"
                >Disable Logging</span
              >
              <label class="relative cursor-pointer">
                <input
                  v-model="logDisabled"
                  type="checkbox"
                  class="sr-only"
                  @change="updateLogConfiguration"
                />
                <div
                  class="w-9 h-5 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
                  :class="logDisabled ? 'bg-red-500' : 'bg-gray-200'"
                />
                <div
                  class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out"
                  :class="logDisabled ? 'translate-x-4' : 'translate-x-0'"
                />
              </label>
            </div>

            <!-- Log Level Options -->
            <div v-if="!logDisabled" class="log-level-section">
              <span class="text-sm text-gray-600 font-medium mb-3 block"
                >Level</span
              >
              <div class="segmented-control log-segmented-control">
                <div class="segmented-control-track">
                  <div
                    class="segmented-control-indicator"
                    :class="{ 'no-transition': !enableTransitions }"
                    :style="{
                      left: `calc(3px + ${logLevels.indexOf(selectedLogLevel)} * (100% - 6px) / ${logLevels.length})`,
                      width: `calc((100% - 6px) / ${logLevels.length})`,
                    }"
                  />
                  <button
                    v-for="level in logLevels"
                    :key="level"
                    class="segmented-control-option log-option"
                    :class="{ active: selectedLogLevel === level }"
                    @click="setLogLevel(level)"
                  >
                    {{ level.charAt(0).toUpperCase() + level.slice(1) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Show message when no configuration fields are available -->
        <div
          v-if="!hasStackField && !hasLogField && !isLoading"
          class="setting-item-vertical"
        >
          <div class="text-sm text-gray-500 italic text-center py-4">
            No configuration options available for the current config file.
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Config Override</h3>

        <div class="setting-item border-b-0!">
          <span class="text-base text-gray-700 font-medium"
            >Enable Override</span
          >
          <label class="relative cursor-pointer">
            <input
              v-model="isOverrideEnabled"
              type="checkbox"
              class="sr-only"
            />
            <div
              class="w-11 h-6 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
              :class="isOverrideEnabled ? 'bg-blue-500' : 'bg-gray-200'"
            />
            <div
              class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out"
              :class="isOverrideEnabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </label>
        </div>

        <div v-if="isOverrideEnabled" class="mt-4">
          <div class="mb-4">
            <textarea
              v-model="overrideConfig"
              placeholder="Enter your configuration override here (JSON format)"
              rows="12"
              class="w-full p-4 border border-gray-300 rounded-lg bg-white text-gray-800 text-sm leading-relaxed resize-y transition-all duration-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              :class="!isValidJson ? 'border-red-400 bg-red-50' : ''"
              style="
                font-family:
                  &quot;Consolas&quot;, &quot;Monaco&quot;,
                  &quot;Courier New&quot;, monospace;
                min-height: 280px;
              "
            />
            <div
              v-if="!isValidJson"
              class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              <strong>JSON Error:</strong> {{ jsonError }}
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <button
              :disabled="!isValidJson"
              class="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              @click="saveOverride"
            >
              Save Override
            </button>
            <button
              class="px-5 py-2.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors duration-200"
              @click="clearOverride"
            >
              Clear Override
            </button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Application</h3>
        <div class="flex flex-col gap-4">
          <div class="setting-item">
            <button
              class="control-button bg-gray-500 text-white hover:bg-gray-600 flex items-center gap-2"
              @click="openAppDirectory"
            >
              <span class="text-base">📁</span>
              Open App Directory
            </button>
          </div>

          <div
            class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
          >
            <div
              class="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 flex-wrap"
            >
              <div>
                <p class="text-sm font-semibold text-gray-800 m-0">
                  Sing-box Core
                </p>
                <p class="text-xs text-gray-500 m-0 mt-1">
                  Syncs with the latest SagerNet/sing-box Windows amd64 release.
                </p>
              </div>
              <span
                class="text-xs font-semibold px-3 py-1 rounded-full"
                :class="coreStatusBadgeClass"
              >
                {{ coreStatusText }}
              </span>
            </div>

            <div class="p-4 flex flex-col gap-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p class="text-xs uppercase tracking-wide text-gray-500 m-0">
                    Current Version
                  </p>
                  <p class="text-sm font-semibold text-gray-800 m-0 mt-2">
                    {{ coreStatus?.current_version || "Not installed" }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p class="text-xs uppercase tracking-wide text-gray-500 m-0">
                    Latest Version
                  </p>
                  <p class="text-sm font-semibold text-gray-800 m-0 mt-2">
                    {{ coreStatus?.latest_version || "Unavailable" }}
                  </p>
                </div>
              </div>

              <div
                v-if="coreStatus?.is_running"
                class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                The latest core can still be downloaded now, but you need to stop
                sing-box before it can be unpacked and applied.
              </div>

              <div
                v-if="coreStatusError"
                class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {{ coreStatusError }}
              </div>

              <div class="flex gap-3 flex-wrap">
                <button
                  class="control-button text-white border-0 px-4 py-3 rounded-lg cursor-pointer text-sm font-medium flex items-center gap-2 transition-all duration-200 flex-1 shadow-sm min-w-40"
                  :class="
                    isRefreshingCoreStatus
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed transform-none shadow-none'
                      : 'bg-slate-500 hover:bg-slate-600 hover:shadow-sm config-button-hover'
                  "
                  :disabled="isRefreshingCoreStatus || isUpdatingCore"
                  @click="refreshCoreStatus(true)"
                >
                  <span
                    v-if="isRefreshingCoreStatus"
                    class="text-base flex items-center justify-center w-5 h-5 animate-spin"
                    >🔄</span
                  >
                  <span
                    v-else
                    class="text-base flex items-center justify-center w-5 h-5"
                    >🧭</span
                  >
                  <span class="font-medium">
                    {{ isRefreshingCoreStatus ? "Checking..." : "Check Latest" }}
                  </span>
                </button>

                <button
                  class="control-button text-white border-0 px-4 py-3 rounded-lg cursor-pointer text-sm font-medium flex items-center gap-2 transition-all duration-200 flex-1 shadow-sm min-w-40"
                  :class="
                    isUpdatingCore
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed transform-none shadow-none'
                      : 'bg-violet-600 hover:bg-violet-700 hover:shadow-sm config-button-hover'
                  "
                  :disabled="
                    isUpdatingCore ||
                    isRefreshingCoreStatus ||
                    !coreStatus?.latest_version
                  "
                  @click="updateSingboxCore"
                >
                  <span
                    v-if="isUpdatingCore"
                    class="text-base flex items-center justify-center w-5 h-5 animate-spin"
                    >⬇️</span
                  >
                  <span
                    v-else
                    class="text-base flex items-center justify-center w-5 h-5"
                    >⚙️</span
                  >
                  <span class="font-medium">
                    {{ updateCoreButtonLabel }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Process Management</h3>
        <div class="flex flex-col gap-4">
          <div class="flex gap-3 flex-wrap">
            <button
              class="control-button text-white border-0 px-4 py-3 rounded-lg cursor-pointer text-sm font-medium flex items-center gap-2 transition-all duration-200 flex-1 shadow-sm min-w-40"
              :class="
                isRefreshing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed transform-none shadow-none'
                  : 'bg-green-500 hover:bg-green-600 hover:shadow-sm config-button-hover'
              "
              :disabled="isRefreshing"
              @click="refreshSingboxDetection"
            >
              <span
                v-if="isRefreshing"
                class="text-base flex items-center justify-center w-5 h-5 animate-spin"
                >🔄</span
              >
              <span
                v-else
                class="text-base flex items-center justify-center w-5 h-5"
                >🔍</span
              >
              <span class="font-medium">
                {{ isRefreshing ? "Detecting..." : "Detect Process" }}
              </span>
            </button>
            <button
              class="control-button text-white border-0 px-4 py-3 rounded-lg cursor-pointer text-sm font-medium flex items-center gap-2 transition-all duration-200 flex-1 shadow-sm min-w-40"
              :class="
                isGettingStatus
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed transform-none shadow-none'
                  : 'bg-blue-500 hover:bg-blue-600 hover:shadow-sm config-button-hover'
              "
              :disabled="isGettingStatus"
              @click="getSingboxStatus"
            >
              <span
                v-if="isGettingStatus"
                class="text-base flex items-center justify-center w-5 h-5 animate-pulse"
                >⏳</span
              >
              <span
                v-else
                class="text-base flex items-center justify-center w-5 h-5"
                >📊</span
              >
              <span class="font-medium">
                {{ isGettingStatus ? "Getting Status..." : "Get Status" }}
              </span>
            </button>
          </div>

          <div
            v-if="processStatus"
            class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <div
              class="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200"
            >
              <span
                class="text-base flex items-center justify-center w-6 h-6 rounded-full"
              >
                <span v-if="processStatusClass === 'status-success'">✅</span>
                <span v-else-if="processStatusClass === 'status-error'"
                  >❌</span
                >
                <span v-else>ℹ️</span>
              </span>
              <span class="font-semibold text-gray-800 text-sm"
                >Process Status</span
              >
            </div>
            <div class="p-4">
              <p
                class="m-0 text-sm font-medium leading-relaxed p-3 rounded-md border-l-4"
                :class="getStatusTextClass()"
              >
                {{ processStatus }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useConfigOverride } from "../services/configOverride";
import { invoke } from "@tauri-apps/api/core";
import Toast from "./Toast.vue";

type ConfigOverride = Record<string, unknown>;
type StackOption = "mixed" | "gvisor" | "system";
type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "panic";

interface LogConfig {
  disabled: boolean;
  level: string;
}

interface PriorityConfig {
  stack?: string;
  log?: LogConfig;
}

interface SingboxCoreStatus {
  installed: boolean;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  is_running: boolean;
}

interface SingboxCoreUpdateResult {
  previous_version: string | null;
  current_version: string;
  latest_version: string;
}

const toastRef = ref(null as InstanceType<typeof Toast> | null);
const jsonError = ref("");
const rawConfig = ref("");
const isRefreshing = ref(false);
const isGettingStatus = ref(false);
const processStatus = ref("");
const isRefreshingCoreStatus = ref(false);
const isUpdatingCore = ref(false);
const coreStatus = ref(null as SingboxCoreStatus | null);
const coreStatusError = ref("");

// Configuration state - unified approach
const isLoading = ref(false);
const enableTransitions = ref(false);
const selectedStackOption = ref<StackOption>("mixed");
const hasStackField = ref(false);
const logDisabled = ref(false);
const selectedLogLevel = ref<LogLevel>("info");
const hasLogField = ref(false);
const logLevels: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

const {
  isEnabled,
  config,
  enableOverride,
  disableOverride,
  saveConfig,
  clearConfig,
} = useConfigOverride();

// 统一的配置加载函数
const loadConfiguration = async () => {
  isLoading.value = true;
  enableTransitions.value = false;

  try {
    const selectedConfig = localStorage.getItem("lastSelectedConfig");
    if (!selectedConfig) {
      hasStackField.value = false;
      hasLogField.value = false;
      return;
    }

    // 并行加载配置字段检查和优先级配置
    const [fieldsCheck, priorityConfig] = await Promise.all([
      invoke<{
        has_stack_field: boolean;
        has_log_field: boolean;
        current_stack_value?: string;
        current_log_disabled?: boolean;
        current_log_level?: string;
      }>("check_config_fields", { configPath: selectedConfig }),
      invoke<PriorityConfig>("load_priority_config").catch(
        () => ({}) as PriorityConfig,
      ),
    ]);

    // 设置字段可用性
    hasStackField.value = fieldsCheck.has_stack_field;
    hasLogField.value = fieldsCheck.has_log_field;

    // 设置 stack 配置
    if (fieldsCheck.has_stack_field) {
      const stackValue =
        priorityConfig.stack || fieldsCheck.current_stack_value;
      if (stackValue && ["mixed", "gvisor", "system"].includes(stackValue)) {
        selectedStackOption.value = stackValue as StackOption;
      }
    }

    // 设置 log 配置
    if (fieldsCheck.has_log_field) {
      const logConfig = priorityConfig.log;
      if (logConfig) {
        logDisabled.value = logConfig.disabled;
        if (
          [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            "panic",
          ].includes(logConfig.level)
        ) {
          selectedLogLevel.value = logConfig.level as LogLevel;
        }
      } else {
        if (typeof fieldsCheck.current_log_disabled === "boolean") {
          logDisabled.value = fieldsCheck.current_log_disabled;
        }
        if (
          fieldsCheck.current_log_level &&
          [
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            "panic",
          ].includes(fieldsCheck.current_log_level)
        ) {
          selectedLogLevel.value = fieldsCheck.current_log_level as LogLevel;
        }
      }
    }
  } catch (error) {
    console.error("Failed to load configuration:", error);
    hasStackField.value = false;
    hasLogField.value = false;
  } finally {
    isLoading.value = false;
    // 延迟启用过渡动画，确保DOM更新完成
    setTimeout(() => {
      enableTransitions.value = true;
    }, 50);
  }
};

// 更新 stack 选项
const updateStackConfiguration = async () => {
  if (!hasStackField.value) {
    return;
  }

  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<PriorityConfig>("load_priority_config");

    const updatedConfig: PriorityConfig = {
      ...priorityConfig,
      stack: selectedStackOption.value,
    };

    await invoke("save_priority_config", { config: updatedConfig });

    toastRef.value?.showToast(
      `Stack option updated to: ${selectedStackOption.value}`,
      "success",
    );
  } catch (error) {
    console.error("Failed to update stack configuration:", error);
    toastRef.value?.showToast("Failed to update stack configuration", "error");
  }
};

// 更新 log 选项
const updateLogConfiguration = async () => {
  if (!hasLogField.value) {
    return;
  }

  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<PriorityConfig>("load_priority_config");

    const updatedConfig: PriorityConfig = {
      ...priorityConfig,
      log: {
        disabled: logDisabled.value,
        level: selectedLogLevel.value,
      },
    };

    await invoke("save_priority_config", { config: updatedConfig });

    toastRef.value?.showToast(
      `Log configuration updated: level=${selectedLogLevel.value}, disabled=${logDisabled.value}`,
      "success",
    );
  } catch (error) {
    console.error("Failed to update log configuration:", error);
    toastRef.value?.showToast("Failed to update log configuration", "error");
  }
};

const formatCommandError = (error: unknown) => {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const entries = Object.entries(error as Record<string, unknown>);
    const [, message] = entries[0] || [];
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Unknown error";
};

const refreshCoreStatus = async (showErrorToast = false) => {
  if (isRefreshingCoreStatus.value) return;

  isRefreshingCoreStatus.value = true;
  coreStatusError.value = "";

  try {
    coreStatus.value =
      await invoke<SingboxCoreStatus>("get_singbox_core_status");
  } catch (error) {
    coreStatus.value = null;
    const message = formatCommandError(error);
    coreStatusError.value = message;
    if (showErrorToast) {
      toastRef.value?.showToast(message, "error");
    }
  } finally {
    isRefreshingCoreStatus.value = false;
  }
};

const updateSingboxCore = async () => {
  if (isUpdatingCore.value) return;

  isUpdatingCore.value = true;

  try {
    const result =
      await invoke<SingboxCoreUpdateResult>("update_singbox_core");
    toastRef.value?.showToast(
      `Sing-box core updated to ${result.current_version}`,
      "success",
    );
    await refreshCoreStatus();
  } catch (error) {
    toastRef.value?.showToast(formatCommandError(error), "error");
  } finally {
    isUpdatingCore.value = false;
  }
};

// 窗口聚焦事件处理
const handleWindowFocus = async () => {
  await loadConfiguration();
};

// 组件挂载时初始化
onMounted(async () => {
  // 并行加载配置覆盖、配置字段和核心状态
  await Promise.all([
    // 加载配置覆盖
    invoke<ConfigOverride>("load_config_override")
      .then((loadedConfig) => {
        if (Object.keys(loadedConfig).length > 0) {
          rawConfig.value = JSON.stringify(loadedConfig, null, 2);
          config.value = loadedConfig;
        }
      })
      .catch((error) =>
        console.error("Failed to load config override:", error),
      ),
    // 加载配置字段
    loadConfiguration(),
    refreshCoreStatus(),
  ]);

  // 添加窗口聚焦事件监听
  window.addEventListener("focus", handleWindowFocus);
});

// Stack and Log options
const stackOptions: StackOption[] = ["mixed", "gvisor", "system"];

// Stack and Log option methods
const setStackOption = (option: StackOption) => {
  selectedStackOption.value = option;
  updateStackConfiguration();
};

const setLogLevel = (level: LogLevel) => {
  selectedLogLevel.value = level;
  updateLogConfiguration();
};

// 清理事件监听
onUnmounted(() => {
  window.removeEventListener("focus", handleWindowFocus);
});

const isOverrideEnabled = computed({
  get: () => isEnabled.value,
  set: (value) => (value ? enableOverride() : disableOverride()),
});

const overrideConfig = computed({
  get: () => rawConfig.value,
  set: (value) => {
    rawConfig.value = value;
    // 如果输入为空或只有空白字符，则清除错误
    if (!value.trim()) {
      jsonError.value = "";
      config.value = {};
      return;
    }
    try {
      const parsed = JSON.parse(value);
      config.value = parsed;
      jsonError.value = "";
    } catch (e) {
      if (e instanceof SyntaxError) {
        jsonError.value = e.message;
      } else {
        jsonError.value = "Invalid JSON format";
      }
    }
  },
});

const isValidJson = computed(() => {
  return jsonError.value === "";
});

const saveOverride = async () => {
  // 检查是否为空内容
  if (!overrideConfig.value.trim()) {
    // 空内容时关闭覆盖并清空配置
    try {
      await clearConfig();
      await disableOverride();
      toastRef.value?.showToast(
        "Empty configuration - override disabled",
        "success",
        "save",
      );
    } catch (error) {
      console.error("Failed to disable config override:", error);
      toastRef.value?.showToast(
        "Failed to disable configuration override",
        "error",
      );
    }
    return;
  }

  if (!isValidJson.value) {
    toastRef.value?.showToast(
      "Please fix JSON format errors before saving",
      "error",
    );
    return;
  }

  try {
    await saveConfig(JSON.parse(overrideConfig.value));
    toastRef.value?.showToast(
      "Configuration override saved successfully",
      "success",
      "save",
    );
  } catch (error) {
    console.error("Failed to save config override:", error);
    toastRef.value?.showToast("Failed to save configuration override", "error");
  }
};

const clearOverride = async () => {
  try {
    await clearConfig();
    // 清除 temp_config.json
    try {
      await invoke("delete_config", { configPath: "temp_config.json" });
    } catch (error) {
      console.error("Failed to delete temp config:", error);
    }
    rawConfig.value = "";
    jsonError.value = "";
    toastRef.value?.showToast(
      "Configuration override cleared successfully",
      "success",
      "clear",
    );
  } catch (error) {
    console.error("Failed to clear config override:", error);
    toastRef.value?.showToast(
      "Failed to clear configuration override",
      "error",
    );
  }
};

const openAppDirectory = async () => {
  try {
    await invoke("open_app_directory");
  } catch (error) {
    console.error("Failed to open app directory:", error);
    toastRef.value?.showToast("Failed to open app directory", "error");
  }
};

// 刷新sing-box进程检测
const refreshSingboxDetection = async () => {
  if (isRefreshing.value) return;

  isRefreshing.value = true;
  processStatus.value = "";

  try {
    const hasProcess = await invoke<boolean>("refresh_singbox_detection");

    if (hasProcess) {
      processStatus.value =
        "Sing-box process detected and now under management";
    } else {
      processStatus.value = "No sing-box process found";
    }
  } catch (error) {
    console.error("Failed to refresh sing-box detection:", error);
    processStatus.value = "Failed to detect sing-box process";
    toastRef.value?.showToast("Failed to detect sing-box process", "error");
  } finally {
    isRefreshing.value = false;
  }
};

// 获取详细的sing-box状态
const getSingboxStatus = async () => {
  if (isGettingStatus.value) return;

  isGettingStatus.value = true;

  try {
    const status = await invoke<string>("get_singbox_status");
    processStatus.value = status;
  } catch (error) {
    console.error("Failed to get sing-box status:", error);
    processStatus.value = "Failed to get sing-box status";
    toastRef.value?.showToast("Failed to get sing-box status", "error");
  } finally {
    isGettingStatus.value = false;
  }
};

// 计算状态文本的样式类
const processStatusClass = computed(() => {
  if (!processStatus.value) return "";

  const status = processStatus.value.toLowerCase();
  if (status.includes("running") || status.includes("detected")) {
    return "status-success";
  } else if (status.includes("failed") || status.includes("error")) {
    return "status-error";
  } else {
    return "status-info";
  }
});

// 获取状态文本的Tailwind类
const getStatusTextClass = () => {
  const statusClass = processStatusClass.value;
  if (statusClass === "status-success") {
    return "text-green-800 bg-green-50 border-green-500";
  } else if (statusClass === "status-error") {
    return "text-red-800 bg-red-50 border-red-500";
  } else {
    return "text-blue-800 bg-blue-50 border-blue-500";
  }
};

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
</script>
