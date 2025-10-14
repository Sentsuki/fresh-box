<script setup lang="ts">
import { computed } from 'vue';
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
    type: Object as () => Record<string, any>,
    default: () => ({}),
  },
});

// 判断当前配置是否为订阅
const isSubscription = computed(() => {
  return props.selectedConfigDisplay && props.subscriptions[props.selectedConfigDisplay];
});

const emit = defineEmits(["start-service", "stop-service"]);

function startService() {
  emit("start-service");
}

function stopService() {
  emit("stop-service");
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
              <svg v-if="isRunning" class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
              </svg>
              <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
          <div class="status-content">
            <h3 class="status-title">{{ isRunning ? "Service Running" : "Service Stopped" }}</h3>
            <p class="status-subtitle">{{ isRunning ? "Sing-box is active and ready" : "Click start to begin" }}</p>
          </div>
          <div class="status-badge" :class="{ active: isRunning }">
            {{ isRunning ? "ACTIVE" : "INACTIVE" }}
          </div>
        </div>
      </div>

      <!-- 配置信息卡片 -->
      <div v-if="selectedConfigDisplay" class="overview-config-card">
        <div class="config-simple">
          <span class="config-name">{{ selectedConfigDisplay }}</span>
          <span class="config-type" :class="{ subscription: isSubscription }">
            {{ isSubscription ? 'Subscription' : 'Local File' }}
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
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
          {{ isLoading && !isRunning ? "Starting..." : "Start" }}
        </button>
        <button
          class="overview-btn stop-btn"
          :disabled="!isRunning || isLoading"
          @click="stopService"
        >
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
          </svg>
          {{ isLoading && isRunning ? "Stopping..." : "Stop" }}
        </button>
      </div>
    </div>
  </div>
</template>
