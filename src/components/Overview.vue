<script setup lang="ts">
import { computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

const props = defineProps({
  isRunning: {
    type: Boolean,
    required: true,
  },
  isLoading: {
    type: Boolean,
    required: true,
  },
  selectedConfigDisplay: {
    type: String as () => string | null,
    default: null,
  },
  selectedConfig: {
    type: String as () => string | null,
    default: null,
  },
  subscriptions: {
    type: Object as () => Record<string, unknown>,
    default: () => ({}),
  },
});

// 判断当前配置是否为订阅
const isSubscription = computed(() => {
  return (
    props.selectedConfigDisplay &&
    props.subscriptions[props.selectedConfigDisplay]
  );
});

const emit = defineEmits(["start-service", "stop-service", "show-toast"]);

function startService() {
  emit("start-service");
}

function stopService() {
  emit("stop-service");
}

// 点击徽章打开网址
async function openWebsite() {
  if (!props.selectedConfig) {
    emit("show-toast", "No config selected", "error");
    return;
  }

  try {
    // 获取 Clash API URL
    const url = await invoke<string | null>("get_clash_api_url", {
      configPath: props.selectedConfig,
    });

    if (url) {
      await invoke("open_url", { url });
    } else {
      emit(
        "show-toast",
        "Clash API not configured in this config file",
        "error",
      );
    }
  } catch (error) {
    emit("show-toast", `Failed to open Clash API: ${error}`, "error");
  }
}
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Overview</h2>
    </div>
    <div class="card-content">
      <!-- 状态卡片 -->
      <div class="overview-status-card" :class="{ running: isRunning }">
        <div class="status-header">
          <div class="status-icon-wrapper">
            <div class="status-icon" :class="{ active: isRunning }">
              <svg
                v-if="isRunning"
                class="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clip-rule="evenodd"
                />
              </svg>
              <svg
                v-else
                class="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div class="status-content">
            <h3 class="status-title">
              {{ isRunning ? "Service Running" : "Service Stopped" }}
            </h3>
            <p class="status-subtitle">
              {{
                isRunning
                  ? "Sing-box is active and ready"
                  : "Click start to begin"
              }}
            </p>
          </div>
          <div
            class="status-badge"
            :class="{ active: isRunning, clickable: isRunning }"
            @click="isRunning ? openWebsite() : null"
          >
            {{ isRunning ? "PANEL" : "INACTIVE" }}
          </div>
        </div>

        <!-- 配置信息 -->
        <div v-if="selectedConfigDisplay" class="status-config-info">
          <div class="config-info-left">
            <svg
              v-if="isSubscription"
              class="config-info-icon subscription"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              />
            </svg>
            <svg
              v-else
              class="config-info-icon"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="config-info-text">{{ selectedConfigDisplay }}</span>
          </div>
          <span
            class="config-info-label"
            :class="{ subscription: isSubscription }"
          >
            {{ isSubscription ? "Subscription" : "Local" }}
          </span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="overview-actions">
        <button
          class="overview-btn start-btn"
          :disabled="isRunning || isLoading || !selectedConfig"
          @click="startService"
        >
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clip-rule="evenodd"
            />
          </svg>
          {{ isLoading && !isRunning ? "Starting..." : "Start" }}
        </button>
        <button
          class="overview-btn stop-btn"
          :disabled="!isRunning || isLoading"
          @click="stopService"
        >
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
              clip-rule="evenodd"
            />
          </svg>
          {{ isLoading && isRunning ? "Stopping..." : "Stop" }}
        </button>
      </div>
    </div>
  </div>
</template>
