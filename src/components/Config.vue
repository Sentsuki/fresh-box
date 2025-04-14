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
const isManaging = ref(false);
const managingFile = ref('');
const newFileName = ref('');
const editingSubscriptionUrl = ref('');

// 计算属性
const hasConfigFiles = computed(() => props.configFiles.length > 0);
const canAddSubscription = computed(() => !!subscriptionUrl.value && !props.isLoading);

// 方法
function selectConfigFile() {
  emit('select-config-file');
}

function switchConfig(index: number) {
  if (props.isLoading || isManaging.value) return;
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
  emit('delete-config', fileName);
}

function startManage(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  isManaging.value = true;
  managingFile.value = fileName;
  newFileName.value = fileName;
  editingSubscriptionUrl.value = props.subscriptions[fileName] || '';
}

function cancelManage(event?: Event) {
  if (event) event.stopPropagation();
  isManaging.value = false;
  managingFile.value = '';
  newFileName.value = '';
  editingSubscriptionUrl.value = '';
}

function saveManage(fileName: string, event?: Event) {
  if (event) event.stopPropagation();
  if (newFileName.value !== fileName) {
    emit('rename-config', fileName, newFileName.value);
  }
  if (editingSubscriptionUrl.value !== props.subscriptions[fileName]) {
    props.subscriptions[fileName] = editingSubscriptionUrl.value;
    emit('update-subscription', fileName);
  }
  cancelManage();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    saveManage(managingFile.value);
  } else if (event.key === 'Escape') {
    cancelManage();
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
          />
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
              'managing': isManaging && managingFile === file
            }" 
            @click="switchConfig(index)"
          >
            <div class="config-item-content">
              <!-- 管理窗口 -->
              <div v-if="isManaging && managingFile === file" class="manage-container" @click.stop>
                <div class="manage-section">
                  <label>Rename:</label>
                  <input 
                    v-model="newFileName" 
                    class="subscription-input" 
                    :disabled="isLoading"
                    @keydown="handleKeydown"
                    ref="renameInput"
                    autofocus
                  />
                </div>
                <div class="manage-section">
                  <label>Subscription URL:</label>
                  <input 
                    v-model="editingSubscriptionUrl" 
                    class="subscription-input" 
                    placeholder="Enter subscription URL"
                    :disabled="isLoading"
                    @keydown="handleKeydown"
                  />
                </div>
                <div class="manage-actions">
                  <button 
                    @click="saveManage(file)"
                    class="action-button update-button"
                    :disabled="isLoading"
                    :class="{ 'disabled': isLoading }"
                    title="Save"
                  >
                    💾 Save
                  </button>
                  <button 
                    @click="cancelManage"
                    class="action-button delete-button"
                    :disabled="isLoading"
                    :class="{ 'disabled': isLoading }"
                    title="Cancel"
                  >
                    ✖ Cancel
                  </button>
                </div>
              </div>
              
              <!-- 普通显示状态 -->
              <div v-else class="config-info">
                <span class="config-name">{{ file }}</span>
              </div>

              <!-- 操作按钮组 -->
              <div v-if="!isManaging" class="config-actions">
                <button 
                  class="action-button manage-button"
                  @click.stop="startManage(file, $event)" 
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
                  title="Manage configuration"
                >
                  ⚙️ Manage
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

<style scoped>
/* ... existing styles ... */

.manage-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background-color: #f8f8f8;
  border-radius: 4px;
}

.manage-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manage-section label {
  font-size: 0.9em;
  color: #666;
}

.manage-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.config-item.managing {
  background-color: #f0f0f0;
}

.config-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 移除不需要的样式 */
.subscription-url {
  display: none;
}
</style>