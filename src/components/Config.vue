<script setup lang="ts">
import { ref, computed } from 'vue';

// 组件属性定义
const props = defineProps<{
  configFiles: string[];
  configFilesDisplay: string[];
  selectedConfig: string | null;
  isLoading: boolean;
  subscriptions: Record<string, string>;
  statusMessage: string | null;
}>();

// 事件定义
const emit = defineEmits<{
  'select-config-file': [];
  'switch-config': [number];
  'add-subscription': [string];
  'update-subscription': [string];
  'delete-config': [string];
  'rename-config': [string, string];
}>();

// 响应式状态
const subscriptionUrl = ref('');
const isRenaming = ref(false);
const newFileName = ref('');
const renamingFile = ref('');

// 计算属性
const hasConfigFiles = computed(() => props.configFiles.length > 0);
const canAddSubscription = computed(() => !!subscriptionUrl.value && !props.isLoading);

// 方法
function selectConfigFile() {
  emit('select-config-file');
}

function switchConfig(index: number) {
  if (props.isLoading || isRenaming.value) return;
  emit('switch-config', index);
}

function addSubscription() {
  if (!canAddSubscription.value) return;
  emit('add-subscription', subscriptionUrl.value);
  subscriptionUrl.value = '';
}

function updateSubscription(fileName: string) {
  if (props.isLoading) return;
  emit('update-subscription', fileName);
}

function deleteConfig(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  emit('delete-config', fileName); // 删除
}

function startRename(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  isRenaming.value = true;
  renamingFile.value = fileName;
  newFileName.value = fileName;
}

function cancelRename(event?: Event) {
  if (event) event.stopPropagation();
  isRenaming.value = false;
  newFileName.value = '';
  renamingFile.value = '';
}

function renameConfig(oldFileName: string, event?: Event) {
  if (event) event.stopPropagation();
  if (!newFileName.value || newFileName.value === oldFileName) {
    cancelRename();
    return;
  }
  emit('rename-config', oldFileName, newFileName.value);
  cancelRename();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    renameConfig(renamingFile.value);
  } else if (event.key === 'Escape') {
    cancelRename();
  }
}
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Configuration Files</h2>
    </div>
    
    <div class="card-content">
      <div class="config-container">
        <!-- 错误提示 -->
        <div v-if="statusMessage && (statusMessage.includes('Error') || statusMessage.includes('timed out'))" class="error-message">
          {{ statusMessage }}
        </div>

        <!-- 订阅输入区域 -->
        <div class="subscription-input-container">
          <input 
            v-model="subscriptionUrl" 
            type="text" 
            class="subscription-input" 
            placeholder="Enter subscription URL"
            :disabled="isLoading"
            @keyup.enter="addSubscription"
          >
          <button 
            class="control-button subscribe-button" 
            @click="addSubscription"
            :disabled="!canAddSubscription" 
            :class="{ 'disabled': !canAddSubscription }"
          >
            <span class="button-icon">📥</span>
            {{ isLoading ? 'Subscribing...' : 'Subscribe' }}
          </button>
        </div>

        <!-- 添加配置按钮 -->
        <button 
          class="control-button select-button" 
          @click="selectConfigFile" 
          :disabled="isLoading"
          :class="{ 'disabled': isLoading }"
        >
          <span class="button-icon">📁</span>
          Add Config
        </button>

        <!-- 配置列表区域 -->
        <div class="config-list">
          <!-- 无配置文件时的提示 -->
          <div v-if="!hasConfigFiles" class="no-configs">
            No configuration files found
          </div>
          
          <!-- 配置文件列表 -->
          <div 
            v-else
            v-for="(file, index) in configFilesDisplay" 
            :key="configFiles[index]" 
            class="config-item"
            :class="{ 
              'selected': configFiles[index] === selectedConfig,
              'renaming': isRenaming && renamingFile === file
            }" 
            @click="switchConfig(index)"
          >
            <div class="config-item-content">
              <!-- 重命名状态 -->
              <div v-if="isRenaming && renamingFile === file" class="rename-container" @click.stop>
                <input 
                  v-model="newFileName" 
                  class="subscription-input rename-input" 
                  :disabled="isLoading"
                  @keydown="handleKeydown"
                  ref="renameInput"
                  autofocus
                />
                <div class="rename-actions">
                  <button 
                    @click="renameConfig(file)"
                    class="action-button update-button"
                    :disabled="isLoading || !newFileName || newFileName === file"
                    :class="{ 'disabled': isLoading || !newFileName || newFileName === file }"
                    title="Save"
                  >
                    💾
                  </button>
                  <button 
                    @click="cancelRename"
                    class="action-button delete-button"
                    :disabled="isLoading"
                    :class="{ 'disabled': isLoading }"
                    title="Cancel"
                  >
                    ✖
                  </button>
                </div>
              </div>
              
              <!-- 普通显示状态 -->
              <span v-else class="config-name">{{ file }}</span>

              <!-- 操作按钮组 -->
              <div v-if="!isRenaming || renamingFile !== file" class="config-actions">
                <button 
                  class="action-button rename-button"
                  @click.stop="startRename(file, $event)" 
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
                  title="Rename this configuration"
                >
                  ✏️ Rename
                </button>
                <button 
                  v-if="subscriptions[file]" 
                  class="action-button update-button"
                  @click.stop="updateSubscription(file)" 
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
                  title="Update from subscription source"
                >
                  🔄 Update
                </button>
                <button 
                  class="action-button delete-button"
                  @click.stop="deleteConfig(file, $event)" 
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
                  title="Delete this configuration"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>