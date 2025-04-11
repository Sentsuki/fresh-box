<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { fetch } from '@tauri-apps/plugin-http';
import './assets/styles.css';
import { getCleanFileName, saveSubscriptionsToStorage, loadSubscriptionsFromStorage } from './utils';
import Sidebar from './components/Sidebar.vue';
import Overview from './components/Overview.vue';
import Config from './components/Config.vue';
import Settings from './components/Settings.vue';

const isRunning = ref(false);
const statusMessage = ref('Sing-box is stopped.');
const isLoading = ref(false);
const selectedConfig = ref<string | null>(null);
const selectedConfigDisplay = ref<string | null>(null);
const currentPage = ref<'overview' | 'config' | 'settings'>('overview');
const configFiles = ref<string[]>([]);
const configFilesDisplay = ref<string[]>([]);
const subscriptions = ref<Record<string, string>>({});

// 添加重命名函数
async function renameConfig(oldFileName: string, newFileName: string) {
  if (isLoading.value) return;
  
  // 检查新文件名是否已经存在
  if (configFilesDisplay.value.includes(newFileName)) {
    statusMessage.value = "A config with this name already exists";
    return;
  }

  isLoading.value = true;
  try {
    // 调用后端重命名文件
    await invoke('rename_config', { 
      oldPath: `${oldFileName}.json`,
      newPath: `${newFileName}.json`
    });
    
    // 更新订阅信息如果存在
    if (subscriptions.value[oldFileName]) {
      subscriptions.value[newFileName] = subscriptions.value[oldFileName];
      delete subscriptions.value[oldFileName];
      saveSubscriptionsToStorage(subscriptions.value);
    }
    
    statusMessage.value = `Renamed ${oldFileName} to ${newFileName}`;
    
    // 更新选中的配置如果是被重命名的那个
    if (selectedConfig.value?.includes(oldFileName)) {
      selectedConfig.value = configFiles.value.find(f => f.includes(newFileName)) || null;
      selectedConfigDisplay.value = newFileName;
      localStorage.setItem('lastSelectedConfig', selectedConfig.value || '');
      localStorage.setItem('lastSelectedConfigDisplay', newFileName);
    }
    
    await loadConfigFiles();
  } catch (error) {
    statusMessage.value = `Error renaming config: ${error}`;
  } finally {
    isLoading.value = false;
  }
}

// 添加订阅
function extractFileNameFromUrl(url: string): string {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  const originalName = pathname.substring(pathname.lastIndexOf('/') + 1) || 'subscription';
  return originalName.endsWith('.json') ? originalName : `${originalName}.json`;
}

async function addSubscription(url: string) {
  if (!url || isLoading.value) return;

  isLoading.value = true;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const content = await response.text();
    const fileName = extractFileNameFromUrl(url);

    // 调用后端保存文件
    const targetPath = await invoke<string>('save_subscription_config', {
      fileName,
      content
    });

    const cleanFileName = getCleanFileName(targetPath);
    subscriptions.value[cleanFileName] = url;
    saveSubscriptionsToStorage(subscriptions.value);
    statusMessage.value = `Subscribed to: ${cleanFileName}`;
    await loadConfigFiles();
  } catch (error) {
    statusMessage.value = `Error adding subscription: ${error}`;
    isLoading.value = false; // 发生错误时立即恢复按钮状态
  } finally {
    if (!isLoading.value) return; // 如果已经因为错误恢复了状态，就不再执行下面的代码
    isLoading.value = false;
  }
}

// 更新订阅
async function updateSubscription(fileName: string) {
  if (isLoading.value || !subscriptions.value[fileName]) return;

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

// 删除配置文件
async function deleteConfig(fileName: string) {
  if (isLoading.value) return;
  
  // 检查是否正在使用该配置文件
  const fullFileName = configFiles.value.find(file => getCleanFileName(file) === fileName);
  if (fullFileName === selectedConfig.value && isRunning.value) {
    statusMessage.value = "Cannot delete active configuration. Stop the service first.";
    return;
  }
  
  isLoading.value = true;
  try {
    // 调用后端删除文件
    await invoke('delete_config', { configPath: `${fileName}.json` });
    
    // 如果是订阅配置，从订阅列表中删除
    if (subscriptions.value[fileName]) {
      delete subscriptions.value[fileName];
      saveSubscriptionsToStorage(subscriptions.value);
    }
    
    statusMessage.value = `Deleted config: ${fileName}`;
    
    // 重新加载配置文件列表
    await loadConfigFiles();
    
    // 如果删除的是当前选中的配置，重置选择
    if (fullFileName === selectedConfig.value) {
      if (configFiles.value.length > 0) {
        selectedConfig.value = configFiles.value[0];
        selectedConfigDisplay.value = configFilesDisplay.value[0];
        localStorage.setItem('lastSelectedConfig', selectedConfig.value);
        localStorage.setItem('lastSelectedConfigDisplay', selectedConfigDisplay.value);
      } else {
        selectedConfig.value = null;
        selectedConfigDisplay.value = null;
        localStorage.removeItem('lastSelectedConfig');
        localStorage.removeItem('lastSelectedConfigDisplay');
      }
    }
  } catch (error) {
    statusMessage.value = `Error deleting config: ${error}`;
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
      await invoke<string>('copy_config_to_bin', { configPath: file as string });
      statusMessage.value = `Added config file successfully`;
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
  } else {
    statusMessage.value = 'Cannot change config while service is running. Stop the service first.';
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
  subscriptions.value = loadSubscriptionsFromStorage(); // 先加载订阅信息
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
    <Sidebar 
      :current-page="currentPage"
      @update:current-page="currentPage = $event"
    />

    <div class="main-content">
      <!-- Overview 页面 -->
      <Overview 
        v-if="currentPage === 'overview'"
        :is-running="isRunning"
        :is-loading="isLoading"
        :status-message="statusMessage"
        :selected-config-display="selectedConfigDisplay"
        :selected-config="selectedConfig"
        @start-service="startService"
        @stop-service="stopService"
      />

      <!-- Config 页面 -->
      <Config 
        v-if="currentPage === 'config'"
        :config-files="configFiles"
        :config-files-display="configFilesDisplay"
        :selected-config="selectedConfig"
        :is-loading="isLoading"
        :subscriptions="subscriptions"
        :status-message="statusMessage"
        @select-config-file="selectConfigFile"
        @switch-config="switchConfig"
        @add-subscription="addSubscription"
        @update-subscription="updateSubscription"
        @delete-config="deleteConfig"
        @rename-config="renameConfig"
      />

      <!-- Settings 页面 -->
      <Settings v-if="currentPage === 'settings'" />
    </div>
  </div>
</template>