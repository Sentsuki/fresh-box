<script setup lang="ts">
defineProps({
  isRunning: {
    type: Boolean,
    required: true,
  },
  isLoading: {
    type: Boolean,
    required: true,
  },
  statusMessage: {
    type: String,
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
      <div class="status-container">
        <div class="status-indicator" :class="{ active: isRunning }">
          <span class="status-dot"/>
          <span class="status-text">{{
            isRunning ? "Running" : "Stopped"
          }}</span>
        </div>
        <p
          class="status-message"
          :class="{ running: isRunning, stopped: !isRunning }"
        >
          {{ statusMessage }}
        </p>
      </div>

      <div v-if="selectedConfigDisplay" class="selected-config">
        <div class="config-badge">
          <span class="mr-2">📄</span>
          <span>{{ selectedConfigDisplay }}</span>
        </div>
      </div>

      <div class="controls">
        <button
          class="control-button start-button"
          :disabled="isRunning || isLoading || !selectedConfig"
          :class="{ disabled: isRunning || isLoading || !selectedConfig }"
          @click="startService"
        >
          <span class="mr-3 text-lg">▶</span>
          {{ isLoading && !isRunning ? "Starting..." : "Start" }}
        </button>
        <button
          class="control-button stop-button"
          :disabled="!isRunning || isLoading"
          :class="{ disabled: !isRunning || isLoading }"
          @click="stopService"
        >
          <span class="mr-3 text-lg">■</span>
          {{ isLoading && isRunning ? "Stopping..." : "Stop" }}
        </button>
      </div>
    </div>
  </div>
</template>
