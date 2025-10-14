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
      <h2>Service Status</h2>
    </div>
    <div class="card-content">
      <div class="status-display">
        <div class="status-card" :class="{ running: isRunning, stopped: !isRunning }">
          <div class="status-icon-container">
            <div class="status-icon" :class="{ pulse: isRunning }">
              <svg v-if="isRunning" class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
              </svg>
              <svg v-else class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
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

      <div v-if="selectedConfigDisplay" class="config-info">
        <div class="config-card">
          <div class="config-left">
            <div class="config-icon">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="config-details">
              <span class="config-name">{{ selectedConfigDisplay }}</span>
              <span class="config-type">{{ isSubscription ? 'Subscription' : 'Local File' }}</span>
            </div>
          </div>
          <div class="config-right">
            <div class="config-status">
              <span class="config-status-dot" :class="{ active: isRunning }"></span>
              <span class="config-status-text">{{ isRunning ? 'In Use' : 'Ready' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="action-controls">
        <button
          class="action-button start-button"
          :disabled="isRunning || isLoading || !selectedConfig"
          :class="{ disabled: isRunning || isLoading || !selectedConfig }"
          @click="startService"
        >
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
          {{ isLoading && !isRunning ? "Starting..." : "Start" }}
        </button>
        <button
          class="action-button stop-button"
          :disabled="!isRunning || isLoading"
          :class="{ disabled: !isRunning || isLoading }"
          @click="stopService"
        >
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
          </svg>
          {{ isLoading && isRunning ? "Stopping..." : "Stop" }}
        </button>
      </div>
    </div>
  </div>
</template>
