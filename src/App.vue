<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { fetch } from '@tauri-apps/plugin-http';
import './assets/styles.css';

const isRunning = ref(false);
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false);
const selectedConfig = ref<string | null>(null);
const selectedConfigDisplay = ref<string | null>(null);
const currentPage = ref<'overview' | 'config'>('overview');
const configFiles = ref<string[]>([]);
const configFilesDisplay = ref<string[]>([]);
const subscriptionUrl = ref('');
const subscriptions = ref<Record<string, string>>({});

// 获取纯文件名（不包含路径和扩展名）
function getCleanFileName(filePath: string): string {
  const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
  return fileNameWithExt.replace('.json', '');
}

// 保存订阅信息到本地存储
function saveSubscriptionsToStorage() {
  localStorage.setItem('subscriptions', JSON.stringify(subscriptions.value));
}

// 从本地存储加载订阅信息
function loadSubscriptionsFromStorage() {
  const savedSubscriptions = localStorage.getItem('subscriptions');
  if (savedSubscriptions) {
    subscriptions.value = JSON.parse(savedSubscriptions);
  }
}

// 添加订阅
async function addSubscription() {
  if (!subscriptionUrl.value || isRunning.value || isLoading.value) return;

  isLoading.value = true;
  try {
    const response = await fetch(subscriptionUrl.value);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const content = await response.text();
    const fileName = `sub_${Date.now()}.json`;

    // 调用后端保存文件
    const targetPath = await invoke<string>('save_subscription_config', {
      fileName,
      content
    });

    const cleanFileName = getCleanFileName(targetPath);
    subscriptions.value[cleanFileName] = subscriptionUrl.value;
    saveSubscriptionsToStorage(); // 保存订阅信息到本地存储
    statusMessage.value = `Subscribed to: ${cleanFileName}`;
    await loadConfigFiles();
    subscriptionUrl.value = '';
  } catch (error) {
    statusMessage.value = `Error adding subscription: ${error}`;
  } finally {
    isLoading.value = false;
  }
}

// 更新订阅
async function updateSubscription(fileName: string) {
  if (isRunning.value || isLoading.value || !subscriptions.value[fileName]) return;

  isLoading.value = true;
  try {
    const response = await fetch(subscriptions.value[fileName]);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const content = await response.text();

    await invoke<string>('save_subscription_config', {
      fileName: `${fileName}.json`,
      content
    });

    statusMessage.value = `Updated subscription: ${fileName}`;
    await loadConfigFiles();
  } catch (error) {
    statusMessage.value = `Error updating subscription: ${error}`;
  } finally {
    isLoading.value = false;
  }
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
      selectedConfigDisplay.value = getCleanFileName(targetPath);
      localStorage.setItem('lastSelectedConfig', targetPath);
      localStorage.setItem('lastSelectedConfigDisplay', selectedConfigDisplay.value);
      statusMessage.value = `Selected config: ${selectedConfigDisplay.value}`;
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
    
    // 如果之前有选择的配置，恢复选择
    const lastSelectedConfig = localStorage.getItem('lastSelectedConfig');
    if (lastSelectedConfig && configFiles.value.includes(lastSelectedConfig)) {
      selectedConfig.value = lastSelectedConfig;
      selectedConfigDisplay.value = localStorage.getItem('lastSelectedConfigDisplay') || getCleanFileName(lastSelectedConfig);
      statusMessage.value = `Selected config: ${selectedConfigDisplay.value}`;
    } else if (configFiles.value.length > 0) {
      // 如果找不到上次的配置，选择列表中的第一个
      selectedConfig.value = configFiles.value[0];
      selectedConfigDisplay.value = configFilesDisplay.value[0];
      localStorage.setItem('lastSelectedConfig', selectedConfig.value);
      localStorage.setItem('lastSelectedConfigDisplay', selectedConfigDisplay.value);
    }
  } catch (error) {
    console.error('Failed to load config files:', error);
  }
}

// 切换配置文件
function switchConfig(index: number) {
  if (!isRunning.value) {
    selectedConfig.value = configFiles.value[index];
    selectedConfigDisplay.value = configFilesDisplay.value[index];
    // 保存当前选择的配置，以便在重启应用后恢复
    localStorage.setItem('lastSelectedConfig', selectedConfig.value);
    localStorage.setItem('lastSelectedConfigDisplay', selectedConfigDisplay.value);
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

// 初始化时加载配置文件列表和订阅信息
onMounted(() => {
  loadSubscriptionsFromStorage(); // 先加载订阅信息
  loadConfigFiles(); // 然后加载配置文件列表
  
  // 检查服务是否已运行（可选，如果后端提供了这个功能）
  invoke<boolean>('is_singbox_running')
    .then(running => {
      isRunning.value = running;
      statusMessage.value = running ? 'Sing-box is running.' : 'Sing-box is stopped.';
    })
    .catch(err => {
      console.error('Failed to check service status:', err);
    });
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
        <div class="sidebar-item" :class="{ 'active': currentPage === 'overview' }" @click="currentPage = 'overview'">
          <span class="sidebar-icon">📊</span>
          Overview
        </div>
        <div class="sidebar-item" :class="{ 'active': currentPage === 'config' }" @click="currentPage = 'config'">
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
            <button class="control-button start-button" @click="startService"
              :disabled="isRunning || isLoading || !selectedConfig"
              :class="{ 'disabled': isRunning || isLoading || !selectedConfig }">
              <span class="button-icon">▶</span>
              {{ isLoading && !isRunning ? 'Starting...' : 'Start' }}
            </button>
            <button class="control-button stop-button" @click="stopService" :disabled="!isRunning || isLoading"
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
            <!-- 添加订阅输入部分 -->
            <div class="subscription-input-container">
              <input v-model="subscriptionUrl" type="text" class="subscription-input"
                placeholder="Enter subscription URL" :disabled="isRunning">
              <button class="control-button subscribe-button" @click="addSubscription"
                :disabled="isRunning || !subscriptionUrl || isLoading"
                :class="{ 'disabled': isRunning || !subscriptionUrl || isLoading }">
                <span class="button-icon">📥</span>
                {{ isLoading ? 'Subscribing...' : 'Subscribe' }}
              </button>
            </div>

            <button class="control-button select-button" @click="selectConfigFile" :disabled="isRunning"
              :class="{ 'disabled': isRunning }">
              <span class="button-icon">📁</span>
              Add Config
            </button>

            <div class="config-list">
              <div v-if="configFiles.length === 0" class="no-configs">
                No configuration files found
              </div>
              <div v-else v-for="(file, index) in configFilesDisplay" :key="configFiles[index]" class="config-item"
                :class="{
                  'selected': configFiles[index] === selectedConfig,
                  'disabled': isRunning
                }">
                <div class="config-item-content">
                  <span @click="switchConfig(index)">{{ file }}</span>
                  <button v-if="subscriptions[file]" class="update-button" @click="updateSubscription(file)"
                    :disabled="isRunning || isLoading" :class="{ 'disabled': isRunning || isLoading }">
                    🔄 Update
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>