<script setup lang="ts">
import { ref } from 'vue';
// 导入 Tauri Core API 中的 invoke 函数
import { invoke } from '@tauri-apps/api/core'; // 注意 Tauri 2.0 的导入路径

// 响应式状态变量
const isRunning = ref(false); // 标记 sing-box 是否正在运行
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false); // 用于显示加载状态，防止重复点击

// 启动服务的函数
async function startService() {
  if (isRunning.value || isLoading.value) return; // 防止重复启动或在加载时启动
  isLoading.value = true;
  statusMessage.value = 'Starting sing-box...';

  try {
    // 调用后端的 start_singbox 命令
    await invoke('start_singbox');
    isRunning.value = true;
    statusMessage.value = 'Sing-box is running.';
    console.log('Sing-box started successfully via Tauri command.');
  } catch (error) {
    console.error('Failed to start sing-box:', error);
    // 根据后端返回的错误类型显示不同的消息
    if (typeof error === 'object' && error !== null && 'ProcessAlreadyRunning' in error) {
      statusMessage.value = 'Error: Sing-box is already running.';
      isRunning.value = true; // 如果错误是“已运行”，则状态应为 true
    } else if (typeof error === 'object' && error !== null && 'ResourceNotFound' in error) {
       statusMessage.value = `Error starting: Resource not found - ${ (error as any).ResourceNotFound }`;
       isRunning.value = false;
    } else if (typeof error === 'object' && error !== null && 'FailedToStartProcess' in error) {
       statusMessage.value = `Error starting: Failed to start process - ${ (error as any).FailedToStartProcess }`;
       isRunning.value = false;
    }
     else {
      statusMessage.value = `Error starting sing-box: ${JSON.stringify(error)}`;
      isRunning.value = false; // 确保状态正确
    }
  } finally {
    isLoading.value = false;
  }
}

// 停止服务的函数
async function stopService() {
  if (!isRunning.value || isLoading.value) return; // 防止重复停止或在加载时停止
  isLoading.value = true;
  statusMessage.value = 'Stopping sing-box...';

  try {
    // 调用后端的 stop_singbox 命令
    await invoke('stop_singbox');
    isRunning.value = false;
    statusMessage.value = 'Sing-box is stopped.';
    console.log('Sing-box stopped successfully via Tauri command.');
  } catch (error) {
    console.error('Failed to stop sing-box:', error);
     // 根据后端返回的错误类型显示不同的消息
    if (typeof error === 'object' && error !== null && 'ProcessNotRunning' in error) {
      statusMessage.value = 'Error stopping: Sing-box was not running.';
      isRunning.value = false; // 确保状态正确
    } else if (typeof error === 'object' && error !== null && 'FailedToStopProcess' in error) {
      statusMessage.value = `Error stopping: Failed to stop process - ${ (error as any).FailedToStopProcess }`;
      // 状态可能不确定，但我们假设它停了或者无法再控制
      isRunning.value = false;
    }
    else {
      statusMessage.value = `Error stopping sing-box: ${JSON.stringify(error)}`;
      // 即使停止失败，前端也认为它不再可控，设为 stopped
      isRunning.value = false;
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="container">
    <h1>Fresh Box (Sing-box Client)</h1>
    <div class="status">
      Status: <span :class="{ 'running': isRunning, 'stopped': !isRunning }">{{ statusMessage }}</span>
    </div>
    <div class="controls">
      <button @click="startService" :disabled="isRunning || isLoading">
        {{ isLoading && !isRunning ? 'Starting...' : 'Start Sing-box' }}
      </button>
      <button @click="stopService" :disabled="!isRunning || isLoading">
         {{ isLoading && isRunning ? 'Stopping...' : 'Stop Sing-box' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
  font-family: sans-serif;
  text-align: center;
}
.status {
  margin-bottom: 20px;
  font-size: 1.1em;
}
.status span {
  font-weight: bold;
}
.running {
  color: green;
}
.stopped {
  color: red;
}
.controls button {
  padding: 10px 20px;
  margin: 0 10px;
  font-size: 1em;
  cursor: pointer;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.controls button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>