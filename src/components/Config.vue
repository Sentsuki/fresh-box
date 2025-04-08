<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  configFiles: string[];
  configFilesDisplay: string[];
  selectedConfig: string | null;
  isLoading: boolean;
  subscriptions: Record<string, string>;
}>();

const emit = defineEmits<{
  'select-config-file': [];
  'switch-config': [number];
  'add-subscription': [string];
  'update-subscription': [string];
  'delete-config': [string]; // 新增的删除配置事件
}>();

const subscriptionUrl = ref('');

function selectConfigFile() {
  emit('select-config-file');
}

function switchConfig(index: number) {
  emit('switch-config', index);
}

function addSubscription() {
  emit('add-subscription', subscriptionUrl.value);
  subscriptionUrl.value = '';
}

function updateSubscription(fileName: string) {
  emit('update-subscription', fileName);
}

function deleteConfig(fileName: string) {
  emit('delete-config', fileName);
}
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Configuration Files</h2>
    </div>
    <div class="card-content">
      <div class="config-container">
        <!-- 添加订阅输入部分 -->
        <div class="subscription-input-container">
          <input 
            v-model="subscriptionUrl" 
            type="text" 
            class="subscription-input"
            placeholder="Enter subscription URL" 
            :disabled="isLoading"
          >
          <button 
            class="control-button subscribe-button" 
            @click="addSubscription"
            :disabled="!subscriptionUrl || isLoading" 
            :class="{ 'disabled': !subscriptionUrl || isLoading }"
          >
            <span class="button-icon">📥</span>
            {{ isLoading ? 'Subscribing...' : 'Subscribe' }}
          </button>
        </div>

        <button 
          class="control-button select-button" 
          @click="selectConfigFile" 
          :disabled="isLoading"
          :class="{ 'disabled': isLoading }"
        >
          <span class="button-icon">📁</span>
          Add Config
        </button>

        <div class="config-list">
          <div v-if="configFiles.length === 0" class="no-configs">
            No configuration files found
          </div>
          <div 
            v-else 
            v-for="(file, index) in configFilesDisplay" 
            :key="configFiles[index]" 
            class="config-item"
            :class="{
              'selected': configFiles[index] === selectedConfig,
            }"
            @click="switchConfig(index)" 
          >
            <div class="config-item-content">
              <span>{{ file }}</span>
              <div class="config-actions">
                <button 
                  v-if="subscriptions[file]" 
                  class="action-button update-button" 
                  @click.stop="updateSubscription(file)"
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
                >
                  🔄 Update
                </button>
                <button 
                  class="action-button delete-button" 
                  @click.stop="deleteConfig(file)"
                  :disabled="isLoading" 
                  :class="{ 'disabled': isLoading }"
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