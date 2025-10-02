<script setup lang="ts">
import { ref, computed } from "vue";

import { formatLastUpdated, SubscriptionInfo } from "../services/utils";

// 组件属性定义
const props = defineProps({
  configFiles: {
    type: Array as () => string[],
    required: true,
  },
  configFilesDisplay: {
    type: Array as () => string[],
    required: true,
  },
  selectedConfig: {
    type: String as () => string | null,
    default: null,
  },
  isLoading: {
    type: Boolean,
    required: true,
  },
  subscriptions: {
    type: Object as () => Record<string, SubscriptionInfo>,
    required: true,
  },
  statusMessage: {
    type: String as () => string | null,
    default: null,
  },
});

// 事件定义
const emit = defineEmits([
  "select-config-file",
  "switch-config",
  "add-subscription",
  "update-subscription",
  "edit-subscription",
  "delete-config",
  "rename-config",
]);

// 响应式状态
const subscriptionUrl = ref("");
const isManaging = ref(false);
const managingFile = ref("");
const newFileName = ref("");
const editingSubscriptionUrl = ref("");

// 计算属性
const hasConfigFiles = computed(() => props.configFiles.length > 0);
const canAddSubscription = computed(
  () => !!subscriptionUrl.value && !props.isLoading,
);

// 方法
function selectConfigFile() {
  emit("select-config-file");
}

function switchConfig(index: number) {
  if (props.isLoading || isManaging.value) return;
  emit("switch-config", index);
}

function addSubscription() {
  if (!canAddSubscription.value) return;
  emit("add-subscription", subscriptionUrl.value);
  subscriptionUrl.value = "";
}

function updateSubscription(fileName: string) {
  if (props.isLoading) return;
  emit("update-subscription", fileName);
}

function deleteConfig(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  emit("delete-config", fileName);
}

function startManage(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  isManaging.value = true;
  managingFile.value = fileName;
  newFileName.value = fileName;
  editingSubscriptionUrl.value = props.subscriptions[fileName]?.url || "";
}

function cancelManage(event?: Event) {
  if (event) event.stopPropagation();
  isManaging.value = false;
  managingFile.value = "";
  newFileName.value = "";
  editingSubscriptionUrl.value = "";
}

function saveManage(fileName: string, event?: Event) {
  if (event) event.stopPropagation();
  if (newFileName.value !== fileName) {
    emit("rename-config", fileName, newFileName.value);
  }
  if (editingSubscriptionUrl.value !== props.subscriptions[fileName]?.url) {
    emit("edit-subscription", fileName, editingSubscriptionUrl.value);
  }
  cancelManage();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    saveManage(managingFile.value);
  } else if (event.key === "Escape") {
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
        <div
          v-if="
            statusMessage &&
            (statusMessage.includes('Error') ||
              statusMessage.includes('timed out'))
          "
          class="error-message"
        >
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
            :disabled="!canAddSubscription"
            :class="{ disabled: !canAddSubscription }"
            @click="addSubscription"
          >
            <span class="button-icon">📥</span>
            {{ isLoading ? "Subscribing..." : "Subscribe" }}
          </button>
        </div>

        <!-- 添加配置按钮 -->
        <button
          class="control-button select-button"
          :disabled="isLoading"
          :class="{ disabled: isLoading }"
          @click="selectConfigFile"
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
            v-for="(file, index) in configFilesDisplay"
            v-else
            :key="configFiles[index]"
            class="config-item"
            :class="{
              selected: configFiles[index] === selectedConfig,
              managing: isManaging && managingFile === file,
            }"
            @click="switchConfig(index)"
          >
            <div class="config-item-content">
              <!-- 管理窗口 -->
              <div
                v-if="isManaging && managingFile === file"
                class="manage-container"
                @click.stop
              >
                <div class="manage-section">
                  <label>Rename:</label>
                  <input
                    ref="renameInput"
                    v-model="newFileName"
                    class="subscription-input"
                    :disabled="isLoading"
                    autofocus
                    @keydown="handleKeydown"
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
                    class="action-button update-button"
                    :disabled="isLoading"
                    :class="{ disabled: isLoading }"
                    title="Save"
                    @click="saveManage(file)"
                  >
                    Save
                  </button>
                  <button
                    class="action-button delete-button"
                    :disabled="isLoading"
                    :class="{ disabled: isLoading }"
                    title="Cancel"
                    @click="cancelManage"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <!-- 普通显示状态 -->
              <div v-else class="config-info">
                <span class="config-name">{{ file }}</span>
                <span v-if="subscriptions[file]" class="last-updated">
                  {{ formatLastUpdated(subscriptions[file].lastUpdated) }}
                </span>
              </div>

              <!-- 操作按钮组 -->
              <div v-if="!isManaging" class="config-actions">
                <button
                  v-if="subscriptions[file]"
                  class="action-button update-button"
                  :disabled="isLoading"
                  :class="{ disabled: isLoading }"
                  title="Update from subscription source"
                  @click.stop="updateSubscription(file)"
                >
                  Update
                </button>
                <button
                  class="action-button manage-button"
                  :disabled="isLoading"
                  :class="{ disabled: isLoading }"
                  title="Manage configuration"
                  @click.stop="startManage(file, $event)"
                >
                  Manage
                </button>
                <button
                  class="action-button delete-button"
                  :disabled="isLoading"
                  :class="{ disabled: isLoading }"
                  title="Delete this configuration"
                  @click.stop="deleteConfig(file, $event)"
                >
                  Delete
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
.config-actions {
  display: flex;
  gap: var(--space-sm);
  margin-left: auto;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  min-width: 80px;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  background: var(--color-gray-lightest);
  color: var(--color-gray-dark);
}

.action-button:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.action-button:active:not(.disabled) {
  transform: translateY(0);
  box-shadow: none;
}

.action-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.manage-button {
  background: var(--color-primary);
  color: var(--color-white);
}

.manage-button:hover:not(.disabled) {
  background: var(--color-primary-dark);
}

.update-button {
  background: var(--color-success);
  color: var(--color-white);
}

.update-button:hover:not(.disabled) {
  background: var(--color-success-dark);
}

.delete-button {
  background: var(--color-danger);
  color: var(--color-white);
}

.delete-button:hover:not(.disabled) {
  background: var(--color-danger-dark);
}

.manage-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  padding: var(--space-lg);
  background-color: var(--color-white);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
}

.manage-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.manage-section label {
  font-size: var(--font-size-sm);
  color: var(--color-gray-dark);
  font-weight: 500;
}

.manage-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: flex-end;
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-gray-lightest);
}

.manage-actions .action-button {
  min-width: 100px;
  padding: var(--space-sm) var(--space-lg);
}

.config-item.managing {
  background-color: var(--color-white);
  border: 1px solid var(--color-gray-lightest);
  border-radius: var(--border-radius-lg);
  margin: var(--space-xs) 0;
  box-shadow: var(--shadow-sm);
}

.config-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.config-name {
  font-weight: 500;
  color: var(--color-gray-dark);
}

.last-updated {
  font-size: var(--font-size-xs);
  color: var(--color-gray);
  font-style: italic;
}

/* 移除不需要的样式 */
.subscription-url {
  display: none;
}
</style>
