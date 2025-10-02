<script setup lang="ts">
defineProps({
  isRunning: {
    type: Boolean,
    required: true
  },
  isLoading: {
    type: Boolean,
    required: true
  },
  statusMessage: {
    type: String,
    required: true
  },
  selectedConfigDisplay: {
    type: String as () => string | null,
    default: null
  },
  selectedConfig: {
    type: String as () => string | null,
    default: null
  }
});

const emit = defineEmits(['start-service', 'stop-service']);

function startService() {
  emit('start-service');
}

function stopService() {
  emit('stop-service');
}
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Service Status</h2>
    </div>
    <div class="card-content">
      <div class="status-container">
        <div class="status-indicator" :class="{ 'active': isRunning }">
          <span class="status-dot"></span>
          <span class="status-text">{{ isRunning ? 'Running' : 'Stopped' }}</span>
        </div>
        <p class="status-message" :class="{ 'running': isRunning, 'stopped': !isRunning }">
          {{ statusMessage }}
        </p>
      </div>

      <div class="selected-config" v-if="selectedConfigDisplay">
        <div class="config-badge">
          <span class="config-icon">📄</span>
          <span>{{ selectedConfigDisplay }}</span>
        </div>
      </div>

      <div class="controls">
        <button 
          class="control-button start-button" 
          @click="startService"
          :disabled="isRunning || isLoading || !selectedConfig"
          :class="{ 'disabled': isRunning || isLoading || !selectedConfig }"
        >
          <span class="button-icon">▶</span>
          {{ isLoading && !isRunning ? 'Starting...' : 'Start' }}
        </button>
        <button 
          class="control-button stop-button" 
          @click="stopService" 
          :disabled="!isRunning || isLoading"
          :class="{ 'disabled': !isRunning || isLoading }"
        >
          <span class="button-icon">■</span>
          {{ isLoading && isRunning ? 'Stopping...' : 'Stop' }}
        </button>
      </div>
    </div>
  </div>
</template>