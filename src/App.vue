<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './assets/styles.css';

const isRunning = ref(false);
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false);
const selectedConfig = ref<string | null>(null);

async function selectConfigFile() {
  try {
    console.log('Attempting to open file dialog...');
    const file = await open({
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      multiple: false,
    });
    console.log('File selected:', file);
    if (file) {
      selectedConfig.value = file as string;
      statusMessage.value = `Selected config: ${file}`;
    } else {
      statusMessage.value = 'No config file selected.';
    }
  } catch (error) {
    console.error('Error selecting file:', error);
    statusMessage.value = `Error selecting config file: ${error}`;
  }
}

async function startService() {
  if (isRunning.value || isLoading.value) return;
  if (!selectedConfig.value) {
    statusMessage.value = 'Please select a config file first.';
    return;
  }

  isLoading.value = true;
  statusMessage.value = 'Starting sing-box...';

  try {
    await invoke('start_singbox', { configPath: selectedConfig.value });
    isRunning.value = true;
    statusMessage.value = 'Sing-box is running.';
    console.log('Sing-box started successfully via Tauri command.');
  } catch (error) {
    console.error('Failed to start sing-box:', error);
    if (typeof error === 'object' && error !== null && 'ProcessAlreadyRunning' in error) {
      statusMessage.value = 'Error: Sing-box is already running.';
      isRunning.value = true;
    } else if (typeof error === 'object' && error !== null && 'ResourceNotFound' in error) {
      statusMessage.value = `Error starting: Resource not found - ${(error as any).ResourceNotFound}`;
      isRunning.value = false;
    } else if (typeof error === 'object' && error !== null && 'FailedToStartProcess' in error) {
      statusMessage.value = `Error starting: Failed to start process - ${(error as any).FailedToStartProcess}`;
      isRunning.value = false;
    } else {
      statusMessage.value = `Error starting sing-box: ${JSON.stringify(error)}`;
      isRunning.value = false;
    }
  } finally {
    isLoading.value = false;
  }
}

async function stopService() {
  if (!isRunning.value || isLoading.value) return;
  isLoading.value = true;
  statusMessage.value = 'Stopping sing-box...';

  try {
    await invoke('stop_singbox');
    isRunning.value = false;
    statusMessage.value = 'Sing-box is stopped.';
    console.log('Sing-box stopped successfully via Tauri command.');
  } catch (error) {
    console.error('Failed to stop sing-box:', error);
    if (typeof error === 'object' && error !== null && 'ProcessNotRunning' in error) {
      statusMessage.value = 'Error stopping: Sing-box was not running.';
      isRunning.value = false;
    } else if (typeof error === 'object' && error !== null && 'FailedToStopProcess' in error) {
      statusMessage.value = `Error stopping: Failed to stop process - ${(error as any).FailedToStopProcess}`;
      isRunning.value = false;
    } else {
      statusMessage.value = `Error stopping sing-box: ${JSON.stringify(error)}`;
      isRunning.value = false;
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="app-container">
    <div class="content-card">
      <div class="app-header">
        <h1>Fresh Box</h1>
        <p class="subtitle">Sing-box Client</p>
      </div>

      <div class="status-container">
        <div class="status-indicator" :class="{ 'active': isRunning }">
          <span class="status-dot"></span>
          <span class="status-text">{{ isRunning ? 'Running' : 'Stopped' }}</span>
        </div>
        <p class="status-message" :class="{ 'running': isRunning, 'stopped': !isRunning }">
          {{ statusMessage }}
        </p>
      </div>

      <div class="controls">
        <button 
          class="control-button select-button" 
          @click="selectConfigFile" 
          :disabled="isRunning || isLoading"
          :class="{ 'disabled': isRunning || isLoading }"
        >
          <span class="button-icon">📁</span>
          Select Config
        </button>

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