<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './assets/styles.css';

const isRunning = ref(false);
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false);
const selectedConfig = ref<string | null>(null);
const selectedConfigDisplay = ref<string | null>(null);
const currentPage = ref<'overview' | 'config'>('overview');
const configFiles = ref<string[]>([]);
const configFilesDisplay = ref<string[]>([]);

// 获取纯文件名（不包含路径和扩展名）
function getCleanFileName(filePath: string): string {
  const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
  return fileNameWithExt.replace('.json', '');
}

// 选择配置文件
async function selectConfigFile() {
  try {
    const file = await open({
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      multiple: false,
    });
    if (file) {
      // 调用后端复制文件到 bin 目录
      const targetPath = await invoke<string>('copy_config_to_bin', { configPath: file as string });
      selectedConfig.value = targetPath;
      statusMessage.value = `Selected config: ${targetPath.split('/').pop() || targetPath}`;
      await loadConfigFiles(); // 刷新配置文件列表
    }
  } catch (error) {
    statusMessage.value = `Error selecting config file: ${error}`;
  }
}

// 加载 bin 目录下的配置文件
async function loadConfigFiles() {
  try {
    // 假设后端添加了一个 'list_configs' 命令
    const files = await invoke<string[]>('list_configs');
    configFiles.value = files;
    
    // 创建显示用的文件名数组（仅文件名，不含路径和扩展名）
    configFilesDisplay.value = files.map(file => getCleanFileName(file));
  } catch (error) {
    console.error('Failed to load config files:', error);
  }
}

// 切换配置文件
function switchConfig(index: number) {
  if (!isRunning.value) {
    selectedConfig.value = configFiles.value[index];
    selectedConfigDisplay.value = configFilesDisplay.value[index];
    statusMessage.value = `Selected config: ${selectedConfigDisplay.value}`;
  }
}

// 启动服务
async function startService() {
  if (isRunning.value || isLoading.value || !selectedConfig.value) return;
  isLoading.value = true;
  statusMessage.value = 'Starting sing-box...';
  try {
    await invoke('start_singbox', { configPath: selectedConfig.value });
    isRunning.value = true;
    statusMessage.value = 'Sing-box is running.';
  } catch (error) {
    statusMessage.value = `Error starting sing-box: ${JSON.stringify(error)}`;
    isRunning.value = false;
  } finally {
    isLoading.value = false;
  }
}

// 停止服务
async function stopService() {
  if (!isRunning.value || isLoading.value) return;
  isLoading.value = true;
  statusMessage.value = 'Stopping sing-box...';
  try {
    await invoke('stop_singbox');
    isRunning.value = false;
    statusMessage.value = 'Sing-box is stopped.';
  } catch (error) {
    statusMessage.value = `Error stopping sing-box: ${JSON.stringify(error)}`;
  } finally {
    isLoading.value = false;
  }
}

// 初始化时加载配置文件列表
onMounted(() => {
  loadConfigFiles();
});
</script>

<template>
  <div class="app-container">
    <div class="sidebar">
      <div class="logo-container">
        <h1 class="logo">Fresh Box</h1>
        <p class="subtitle">Sing-box Client</p>
      </div>
      <div class="nav-items">
        <div class="sidebar-item" 
             :class="{ 'active': currentPage === 'overview' }"
             @click="currentPage = 'overview'">
          <span class="sidebar-icon">📊</span>
          Overview
        </div>
        <div class="sidebar-item" 
             :class="{ 'active': currentPage === 'config' }"
             @click="currentPage = 'config'">
          <span class="sidebar-icon">⚙️</span>
          Config
        </div>
      </div>
    </div>

    <div class="main-content">
      <!-- Overview 页面 -->
      <div v-if="currentPage === 'overview'" class="content-card">
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
            <button class="control-button start-button" 
                    @click="startService"
                    :disabled="isRunning || isLoading || !selectedConfig"
                    :class="{ 'disabled': isRunning || isLoading || !selectedConfig }">
              <span class="button-icon">▶</span>
              {{ isLoading && !isRunning ? 'Starting...' : 'Start' }}
            </button>
            <button class="control-button stop-button" 
                    @click="stopService"
                    :disabled="!isRunning || isLoading"
                    :class="{ 'disabled': !isRunning || isLoading }">
              <span class="button-icon">■</span>
              {{ isLoading && isRunning ? 'Stopping...' : 'Stop' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Config 页面 -->
      <div v-if="currentPage === 'config'" class="content-card">
        <div class="card-header">
          <h2>Configuration Files</h2>
        </div>
        <div class="card-content">
          <div class="config-container">
            <button class="control-button select-button" 
                    @click="selectConfigFile"
                    :disabled="isRunning"
                    :class="{ 'disabled': isRunning }">
              <span class="button-icon">📁</span>
              Add Config
            </button>
            
            <div class="config-list">
              <div v-if="configFiles.length === 0" class="no-configs">
                No configuration files found
              </div>
              <div v-else v-for="(file, index) in configFilesDisplay" 
                   :key="configFiles[index]"
                   class="config-item"
                   :class="{ 
                     'selected': configFiles[index] === selectedConfig, 
                     'disabled': isRunning 
                   }"
                   @click="switchConfig(index)">
                {{ file }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>