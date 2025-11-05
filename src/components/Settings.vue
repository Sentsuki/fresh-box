<template>
  <div class="content-card">
    <Toast ref="toastRef" />
    <div class="card-header">
      <h2>Settings</h2>
    </div>

    <div class="card-content">
      <div class="settings-section">
        <h3>Configuration</h3>
        
        <!-- Stack Configuration Switch -->
        <div class="setting-item">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700 font-medium">Stack Configuration</span>
              <label class="relative cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': !hasStackField }">
                <input
                  v-model="isStackSwitchEnabled"
                  type="checkbox"
                  class="sr-only"
                  :disabled="!hasStackField"
                  @change="updateStackSwitchState"
                />
                <div
                  class="w-11 h-6 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
                  :class="isStackSwitchEnabled && hasStackField ? 'bg-green-500' : 'bg-gray-200'"
                />
                <div
                  class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out"
                  :class="isStackSwitchEnabled && hasStackField ? 'translate-x-5' : 'translate-x-0'"
                />
              </label>
            </div>
            <div v-if="!hasStackField" class="text-xs text-gray-500">
              No stack field found in current configuration
            </div>
            <div v-else-if="isStackSwitchEnabled" class="mt-2">
              <select
                v-model="selectedStackOption"
                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                @change="updateStackConfiguration"
              >
                <option value="mixed">Mixed</option>
                <option value="gvisor">GVisor</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Log Configuration Switch -->
        <div class="setting-item">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700 font-medium">Log Configuration</span>
              <label class="relative cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': !hasLogField }">
                <input
                  v-model="isLogSwitchEnabled"
                  type="checkbox"
                  class="sr-only"
                  :disabled="!hasLogField"
                  @change="updateLogSwitchState"
                />
                <div
                  class="w-11 h-6 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
                  :class="isLogSwitchEnabled && hasLogField ? 'bg-green-500' : 'bg-gray-200'"
                />
                <div
                  class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out"
                  :class="isLogSwitchEnabled && hasLogField ? 'translate-x-5' : 'translate-x-0'"
                />
              </label>
            </div>
            <div v-if="!hasLogField" class="text-xs text-gray-500">
              No log field found in current configuration
            </div>
            <div v-else-if="isLogSwitchEnabled" class="mt-2 space-y-3">
              <!-- Log Disabled Setting -->
              <div class="flex items-center justify-between">
                <span class="text-xs text-gray-600 font-medium">Disable Logging</span>
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
              <!-- Log Level Setting -->
              <div>
                <label class="block text-xs text-gray-600 font-medium mb-1">Log Level</label>
                <select
                  v-model="selectedLogLevel"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  @change="updateLogConfiguration"
                >
                  <option value="trace">Trace</option>
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                  <option value="fatal">Fatal</option>
                  <option value="panic">Panic</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="setting-item">
          <span class="text-sm text-gray-700 font-medium"
            >Enable Config Override</span
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

        <div v-if="isOverrideEnabled" class="mt-4 p-4 bg-gray-50 rounded-md">
          <div class="mb-4">
            <textarea
              v-model="overrideConfig"
              placeholder="Enter your configuration override here (JSON format)"
              rows="10"
              class="w-full p-3 border border-gray-300 rounded-md bg-white text-gray-800 text-sm leading-relaxed resize-y transition-all duration-200 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              :class="!isValidJson ? 'border-red-500 bg-red-50' : ''"
              style="
                font-family:
                  &quot;Consolas&quot;, &quot;Monaco&quot;, monospace;
                min-height: 200px;
              "
            />
            <div
              v-if="!isValidJson"
              class="text-red-700 mt-2 text-sm font-medium p-3 bg-red-100 rounded border-l-4 border-red-500"
            >
              {{ jsonError }}
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <button
              :disabled="!isValidJson"
              class="control-button bg-blue-600 text-white hover:bg-blue-700"
              @click="saveOverride"
            >
              Save Override
            </button>
            <button
              class="control-button bg-gray-300 text-gray-700 hover:bg-gray-400"
              @click="clearOverride"
            >
              Clear Override
            </button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Application</h3>
        <div class="setting-item">
          <button
            class="control-button bg-gray-500 text-white hover:bg-gray-600 flex items-center gap-2"
            @click="openAppDirectory"
          >
            <span class="text-base">📁</span>
            Open App Directory
          </button>
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
import { computed, ref, onMounted } from "vue";
import { useConfigOverride } from "../services/configOverride";
import { invoke } from "@tauri-apps/api/core";
import Toast from "./Toast.vue";

type ConfigOverride = Record<string, unknown>;
type StackOption = "mixed" | "gvisor" | "system";
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic";

const toastRef = ref(null as InstanceType<typeof Toast> | null);
const jsonError = ref("");
const rawConfig = ref("");
const isRefreshing = ref(false);
const isGettingStatus = ref(false);
const processStatus = ref("");

// Stack configuration related refs
const isStackSwitchEnabled = ref(false);
const selectedStackOption = ref<StackOption>("mixed");
const hasStackField = ref(false);
const currentConfigContent = ref<any>(null);

// Log configuration related refs
const isLogSwitchEnabled = ref(false);
const logDisabled = ref(false);
const selectedLogLevel = ref<LogLevel>("info");
const hasLogField = ref(false);

const {
  isEnabled,
  config,
  enableOverride,
  disableOverride,
  saveConfig,
  clearConfig,
} = useConfigOverride();

// 检查当前配置文件中是否有 stack 和 log 字段
const checkStackField = async () => {
  try {
    const selectedConfig = localStorage.getItem("lastSelectedConfig");
    if (!selectedConfig) {
      hasStackField.value = false;
      isStackSwitchEnabled.value = false;
      hasLogField.value = false;
      isLogSwitchEnabled.value = false;
      return;
    }

    const configContent = await invoke<any>("load_config_content", { 
      configPath: selectedConfig 
    });
    
    currentConfigContent.value = configContent;
    
    // 检查 inbounds 数组中是否有 stack 字段
    if (configContent?.inbounds && Array.isArray(configContent.inbounds)) {
      const hasStack = configContent.inbounds.some((inbound: any) => 
        inbound && typeof inbound === 'object' && 'stack' in inbound
      );
      hasStackField.value = hasStack;
      
      if (hasStack) {
        // 加载 Priority Configuration 设置
        const priorityConfig = await invoke<{stack?: {enabled: boolean, stack_option: string}}>("load_priority_config");
        const stackConfig = priorityConfig.stack;
        
        if (stackConfig) {
          isStackSwitchEnabled.value = stackConfig.enabled;
          
          if (['mixed', 'gvisor', 'system'].includes(stackConfig.stack_option)) {
            selectedStackOption.value = stackConfig.stack_option as StackOption;
          }
        } else {
          // 如果没有保存的设置，从配置文件中读取当前值
          const stackInbound = configContent.inbounds.find((inbound: any) => 
            inbound && typeof inbound === 'object' && 'stack' in inbound
          );
          if (stackInbound && ['mixed', 'gvisor', 'system'].includes(stackInbound.stack)) {
            selectedStackOption.value = stackInbound.stack as StackOption;
          }
          isStackSwitchEnabled.value = false;
        }
      } else {
        isStackSwitchEnabled.value = false;
      }
    } else {
      hasStackField.value = false;
      isStackSwitchEnabled.value = false;
    }

    // 检查是否有 log 字段
    if (configContent?.log && typeof configContent.log === 'object') {
      hasLogField.value = true;
      
      // 加载 Priority Configuration 设置
      const priorityConfig = await invoke<{log?: {enabled: boolean, disabled: boolean, level: string}}>("load_priority_config");
      const logConfig = priorityConfig.log;
      
      if (logConfig) {
        isLogSwitchEnabled.value = logConfig.enabled;
        logDisabled.value = logConfig.disabled;
        
        if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'panic'].includes(logConfig.level)) {
          selectedLogLevel.value = logConfig.level as LogLevel;
        }
      } else {
        // 如果没有保存的设置，从配置文件中读取当前值
        if (typeof configContent.log.disabled === 'boolean') {
          logDisabled.value = configContent.log.disabled;
        }
        if (typeof configContent.log.level === 'string' && 
            ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'panic'].includes(configContent.log.level)) {
          selectedLogLevel.value = configContent.log.level as LogLevel;
        }
        isLogSwitchEnabled.value = false;
      }
    } else {
      hasLogField.value = false;
      isLogSwitchEnabled.value = false;
    }
  } catch (error) {
    console.error("Failed to check stack and log fields:", error);
    hasStackField.value = false;
    isStackSwitchEnabled.value = false;
    hasLogField.value = false;
    isLogSwitchEnabled.value = false;
  }
};

// 更新 stack 配置开关状态
const updateStackSwitchState = async () => {
  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<{stack?: {enabled: boolean, stack_option: string}}>("load_priority_config");
    
    const updatedConfig = {
      ...priorityConfig,
      stack: {
        enabled: isStackSwitchEnabled.value,
        stack_option: selectedStackOption.value
      }
    };
    
    await invoke("save_priority_config", { config: updatedConfig });
    
    if (isStackSwitchEnabled.value) {
      toastRef.value?.showToast(
        `Stack configuration enabled: ${selectedStackOption.value}`,
        "success"
      );
    } else {
      toastRef.value?.showToast("Stack configuration disabled", "success");
    }
  } catch (error) {
    console.error("Failed to update stack switch state:", error);
    toastRef.value?.showToast("Failed to update stack configuration", "error");
  }
};

// 更新 stack 选项
const updateStackConfiguration = async () => {
  if (!hasStackField.value) {
    return;
  }

  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<{stack?: {enabled: boolean, stack_option: string}}>("load_priority_config");
    
    const updatedConfig = {
      ...priorityConfig,
      stack: {
        enabled: isStackSwitchEnabled.value,
        stack_option: selectedStackOption.value
      }
    };
    
    await invoke("save_priority_config", { config: updatedConfig });
    
    toastRef.value?.showToast(
      `Stack option updated to: ${selectedStackOption.value}`,
      "success"
    );
  } catch (error) {
    console.error("Failed to update stack configuration:", error);
    toastRef.value?.showToast("Failed to update stack configuration", "error");
  }
};

// 更新 log 配置开关状态
const updateLogSwitchState = async () => {
  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<{log?: {enabled: boolean, disabled: boolean, level: string}}>("load_priority_config");
    
    const updatedConfig = {
      ...priorityConfig,
      log: {
        enabled: isLogSwitchEnabled.value,
        disabled: logDisabled.value,
        level: selectedLogLevel.value
      }
    };
    
    await invoke("save_priority_config", { config: updatedConfig });
    
    if (isLogSwitchEnabled.value) {
      toastRef.value?.showToast(
        `Log configuration enabled: level=${selectedLogLevel.value}, disabled=${logDisabled.value}`,
        "success"
      );
    } else {
      toastRef.value?.showToast("Log configuration disabled", "success");
    }
  } catch (error) {
    console.error("Failed to update log switch state:", error);
    toastRef.value?.showToast("Failed to update log configuration", "error");
  }
};

// 更新 log 选项
const updateLogConfiguration = async () => {
  if (!hasLogField.value) {
    return;
  }

  try {
    // 先加载当前的 priority config
    const priorityConfig = await invoke<{log?: {enabled: boolean, disabled: boolean, level: string}}>("load_priority_config");
    
    const updatedConfig = {
      ...priorityConfig,
      log: {
        enabled: isLogSwitchEnabled.value,
        disabled: logDisabled.value,
        level: selectedLogLevel.value
      }
    };
    
    await invoke("save_priority_config", { config: updatedConfig });
    
    toastRef.value?.showToast(
      `Log configuration updated: level=${selectedLogLevel.value}, disabled=${logDisabled.value}`,
      "success"
    );
  } catch (error) {
    console.error("Failed to update log configuration:", error);
    toastRef.value?.showToast("Failed to update log configuration", "error");
  }
};

// 加载已有配置
onMounted(async () => {
  try {
    const loadedConfig = await invoke<ConfigOverride>("load_config_override");
    if (Object.keys(loadedConfig).length > 0) {
      rawConfig.value = JSON.stringify(loadedConfig, null, 2);
      config.value = loadedConfig;
    }
  } catch (error) {
    console.error("Failed to load config override:", error);
  }

  // 检查 stack 字段
  await checkStackField();

  // 监听配置文件变化
  let lastSelectedConfig = localStorage.getItem("lastSelectedConfig");
  const checkConfigChange = () => {
    const currentSelectedConfig = localStorage.getItem("lastSelectedConfig");
    if (currentSelectedConfig !== lastSelectedConfig) {
      lastSelectedConfig = currentSelectedConfig;
      checkStackField();
    }
  };

  // 每隔2秒检查一次配置文件是否变化
  setInterval(checkConfigChange, 2000);
});

const isOverrideEnabled = computed({
  get: () => isEnabled.value,
  set: (value) => (value ? enableOverride() : disableOverride()),
});

const overrideConfig = computed({
  get: () => rawConfig.value,
  set: (value) => {
    rawConfig.value = value;
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
    rawConfig.value = "{}";
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
</script>
