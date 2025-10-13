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
        <div class="setting-item">
          <button 
            class="control-button refresh-button" 
            :disabled="isRefreshing"
            @click="refreshSingboxDetection"
          >
            <span v-if="isRefreshing" class="button-icon">🔄</span>
            <span v-else class="button-icon">🔍</span>
            {{ isRefreshing ? 'Detecting...' : 'Detect Sing-box Process' }}
          </button>
        </div>
        <div v-if="processStatus" class="process-status">
          <p class="status-text" :class="processStatusClass">{{ processStatus }}</p>
        </div>
        <div class="setting-item">
          <button 
            class="control-button status-button" 
            :disabled="isGettingStatus"
            @click="getSingboxStatus"
          >
            <span v-if="isGettingStatus" class="button-icon">⏳</span>
            <span v-else class="button-icon">📊</span>
            {{ isGettingStatus ? 'Getting Status...' : 'Get Detailed Status' }}
          </button>
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
    const hasExternal = await invoke<boolean>("refresh_singbox_detection");
    
    if (hasExternal) {
      processStatus.value = "External sing-box process detected";
      toastRef.value?.showToast(
        "External sing-box process detected",
        "success",
        "detect"
      );
    } else {
      processStatus.value = "No sing-box process found";
      toastRef.value?.showToast(
        "No sing-box process found",
        "info",
        "detect"
      );
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
    
    if (status.includes("running")) {
      toastRef.value?.showToast(status, "success", "status");
    } else {
      toastRef.value?.showToast(status, "info", "status");
    }
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

.refresh-button {
  background: linear-gradient(135deg, #4caf50, #45a049);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.refresh-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #45a049, #3d8b40);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
}

.refresh-button:disabled {
  background: #cccccc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.status-button {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.status-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #1976d2, #1565c0);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
}

.status-button:disabled {
  background: #cccccc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.process-status {
  margin-top: 12px;
  padding: 12px;
  border-radius: 6px;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
}

.status-text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.status-success {
  color: #2e7d32;
  background-color: #e8f5e8;
  border-color: #c8e6c9;
}

.status-error {
  color: #d32f2f;
  background-color: #ffebee;
  border-color: #ffcdd2;
}

.status-info {
  color: #1976d2;
  background-color: #e3f2fd;
  border-color: #bbdefb;
}

.button-icon {
  font-size: 16px;
  display: inline-flex;
  align-items: center;
}

.refresh-button .button-icon {
  animation: none;
}

.refresh-button:disabled .button-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
