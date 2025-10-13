<template>
  <div class="content-card">
    <Toast ref="toastRef" />
    <div class="card-header">
      <h2>Settings</h2>
    </div>

    <div class="card-content">
      <div class="settings-section">
        <h3>Configuration</h3>
        <div class="setting-item">
          <label>Enable Config Override</label>
          <input v-model="isOverrideEnabled" type="checkbox" class="checkbox" />
        </div>

        <div v-if="isOverrideEnabled" class="override-section">
          <div class="config-editor">
            <textarea
              v-model="overrideConfig"
              placeholder="Enter your configuration override here (JSON format)"
              rows="10"
              class="config-textarea"
              :class="{ error: !isValidJson }"
            ></textarea>
            <div v-if="!isValidJson" class="error-message">
              {{ jsonError }}
            </div>
          </div>
          <div class="button-group">
            <button
              :disabled="!isValidJson"
              class="control-button save-button"
              @click="saveOverride"
            >
              Save Override
            </button>
            <button class="control-button clear-button" @click="clearOverride">
              Clear Override
            </button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Application</h3>
        <div class="setting-item">
          <button class="control-button" @click="openAppDirectory">
            Open App Directory
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Process Management</h3>
        <div class="process-management-container">
          <div class="button-row">
            <button
              class="control-button detect-button"
              :disabled="isRefreshing"
              @click="refreshSingboxDetection"
            >
              <span v-if="isRefreshing" class="button-icon spinning">🔄</span>
              <span v-else class="button-icon">🔍</span>
              <span class="button-text">
                {{ isRefreshing ? "Detecting..." : "Detect Process" }}
              </span>
            </button>
            <button
              class="control-button status-button"
              :disabled="isGettingStatus"
              @click="getSingboxStatus"
            >
              <span v-if="isGettingStatus" class="button-icon pulsing">⏳</span>
              <span v-else class="button-icon">📊</span>
              <span class="button-text">
                {{ isGettingStatus ? "Getting Status..." : "Get Status" }}
              </span>
            </button>
          </div>

          <div v-if="processStatus" class="process-status-card">
            <div class="status-header">
              <span class="status-icon" :class="processStatusClass">
                <span v-if="processStatusClass === 'status-success'">✅</span>
                <span v-else-if="processStatusClass === 'status-error'"
                  >❌</span
                >
                <span v-else>ℹ️</span>
              </span>
              <span class="status-title">Process Status</span>
            </div>
            <div class="status-content">
              <p class="status-text" :class="processStatusClass">
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

type ConfigOverride = Record<string, any>;

const toastRef = ref(null as InstanceType<typeof Toast> | null);
const jsonError = ref("");
const rawConfig = ref("");
const isRefreshing = ref(false);
const isGettingStatus = ref(false);
const processStatus = ref("");

const {
  isEnabled,
  config,
  enableOverride,
  disableOverride,
  saveConfig,
  clearConfig,
} = useConfigOverride();

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
</script>

<style scoped>
.config-textarea.error {
  border-color: #f44336;
  background-color: #fff5f5;
}

.error-message {
  color: #d32f2f;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  background-color: #ffebee;
  border-radius: 4px;
  border-left: 4px solid #f44336;
}

.process-management-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.button-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.detect-button {
  background: linear-gradient(135deg, #38a169, #2f855a);
  color: white;
  border: none;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  transition: var(--transition);
  flex: 1;
  min-width: 160px;
  box-shadow: var(--shadow-sm);
}

.detect-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #2f855a, #276749);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.detect-button:disabled {
  background: var(--color-gray-lighter);
  color: var(--color-gray);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.status-button {
  background: linear-gradient(135deg, #3182ce, #2b6cb0);
  color: white;
  border: none;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  transition: var(--transition);
  flex: 1;
  min-width: 160px;
  box-shadow: var(--shadow-sm);
}

.status-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #2b6cb0, #2c5282);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.status-button:disabled {
  background: var(--color-gray-lighter);
  color: var(--color-gray);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.process-status-card {
  background: var(--color-white);
  border: 1px solid var(--color-gray-lightest);
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.process-status-card:hover {
  box-shadow: var(--shadow-md);
}

.status-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-light);
  border-bottom: 1px solid var(--color-gray-lightest);
}

.status-icon {
  font-size: var(--font-size-md);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.status-title {
  font-weight: 600;
  color: var(--color-gray-darker);
  font-size: var(--font-size-sm);
}

.status-content {
  padding: var(--space-lg);
}

.status-text {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1.5;
  padding: var(--space-md);
  border-radius: var(--border-radius-md);
  border-left: 4px solid;
}

.status-success {
  color: var(--color-success-dark);
  background-color: #f0fff4;
  border-left-color: var(--color-success);
}

.status-error {
  color: var(--color-danger-dark);
  background-color: #fff5f5;
  border-left-color: var(--color-danger);
}

.status-info {
  color: var(--color-primary-dark);
  background-color: var(--color-primary-bg-light);
  border-left-color: var(--color-primary);
}

.button-icon {
  font-size: var(--font-size-md);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

.button-text {
  font-weight: 500;
}

.spinning {
  animation: spin 1s linear infinite;
}

.pulsing {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.95);
  }
}
</style>
