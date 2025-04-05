<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const isRunning = ref(false);
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false);

async function startService() {
  if (isRunning.value || isLoading.value) return;
  isLoading.value = true;
  statusMessage.value = 'Starting sing-box...';

  try {
    await invoke('start_singbox');
    isRunning.value = true;
    statusMessage.value = 'Sing-box is running.';
    console.log('Sing-box started successfully via Tauri command.');
  } catch (error) {
    console.error('Failed to start sing-box:', error);
    if (typeof error === 'object' && error !== null && 'ProcessAlreadyRunning' in error) {
      statusMessage.value = 'Error: Sing-box is already running.';
      isRunning.value = true;
    } else if (typeof error === 'object' && error !== null && 'ResourceNotFound' in error) {
       statusMessage.value = `Error starting: Resource not found - ${ (error as any).ResourceNotFound }`;
       isRunning.value = false;
    } else if (typeof error === 'object' && error !== null && 'FailedToStartProcess' in error) {
       statusMessage.value = `Error starting: Failed to start process - ${ (error as any).FailedToStartProcess }`;
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
      statusMessage.value = `Error stopping: Failed to stop process - ${ (error as any).FailedToStopProcess }`;
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
          class="control-button start-button" 
          @click="startService" 
          :disabled="isRunning || isLoading"
          :class="{ 'disabled': isRunning || isLoading }"
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

<style>
/* 添加全局样式重置，消除默认边距造成的滚动条 */
html, body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

*, *:before, *:after {
  box-sizing: inherit;
}
</style>

<style scoped>
.app-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4eaf0 100%);
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  color: #2c3e50;
  padding: 20px;
  margin: 0;
  box-sizing: border-box;
}

.content-card {
  background-color: white;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
  width: 100%;
  max-width: 400px;
  padding: 40px 30px;
  text-align: center;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.app-header {
  margin-bottom: 36px;
}

.app-header h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 600;
  color: #1a365d;
}

.subtitle {
  margin: 8px 0 0;
  font-size: 16px;
  color: #718096;
  font-weight: 400;
}

.status-container {
  margin-bottom: 36px;
  padding: 16px;
  background-color: #f8fafc;
  border-radius: 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.status-dot {
  width: 12px;
  height: 12px;
  background-color: #e53e3e;
  border-radius: 50%;
  margin-right: 8px;
  transition: background-color 0.3s ease;
}

.status-indicator.active .status-dot {
  background-color: #38a169;
  box-shadow: 0 0 12px rgba(56, 161, 105, 0.5);
}

.status-text {
  font-weight: 500;
  font-size: 16px;
}

.status-message {
  margin: 8px 0 0;
  font-size: 14px;
  opacity: 0.8;
  word-break: break-word; /* 防止长文本导致溢出 */
}

.running {
  color: #38a169;
}

.stopped {
  color: #e53e3e;
}

.controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap; /* 在小屏幕上允许按钮换行 */
}

.control-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.start-button {
  background-color: #4299e1;
  color: white;
}

.start-button:hover:not(.disabled) {
  background-color: #3182ce;
  transform: translateY(-2px);
}

.stop-button {
  background-color: #f56565;
  color: white;
}

.stop-button:hover:not(.disabled) {
  background-color: #e53e3e;
  transform: translateY(-2px);
}

.control-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.button-icon {
  margin-right: 8px;
  font-size: 12px;
}

@media (max-width: 480px) {
  .content-card {
    padding: 30px 20px;
  }
  
  .control-button {
    padding: 10px 16px;
    min-width: 100px;
    font-size: 14px;
  }
}
</style>