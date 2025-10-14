<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
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

async function openConfigFile(fileName: string, event: Event) {
  if (props.isLoading) return;
  event.stopPropagation();
  
  try {
    await invoke("open_config_file", {
      configPath: `${fileName}.json`,
    });
  } catch (error) {
    console.error("Failed to open config file:", error);
    // 这里可以添加错误提示，但为了简化就先用console.error
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
        <!-- 订阅输入区域 -->
        <div class="flex gap-3 mb-4">
          <input
            v-model="subscriptionUrl"
            type="text"
            class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
            <span class="mr-3 text-lg">📥</span>
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
          <span class="mr-3 text-lg">📁</span>
          Add Config
        </button>

        <!-- 配置列表区域 -->
        <div class="config-list">
          <!-- 无配置文件时的提示 -->
          <div
            v-if="!hasConfigFiles"
            class="p-6 text-center text-gray-600 italic"
          >
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
                class="flex flex-col gap-4 w-full p-4 bg-white rounded-lg shadow-md"
                @click.stop
              >
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-700 font-medium"
                    >Rename:</label
                  >
                  <input
                    ref="renameInput"
                    v-model="newFileName"
                    class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    :disabled="isLoading"
                    autofocus
                    @keydown="handleKeydown"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm text-gray-700 font-medium"
                    >Subscription URL:</label
                  >
                  <input
                    v-model="editingSubscriptionUrl"
                    class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Enter subscription URL"
                    :disabled="isLoading"
                    @keydown="handleKeydown"
                  />
                </div>
                <div
                  class="flex gap-3 justify-end mt-4 pt-3 border-t border-gray-200"
                >
                  <button
                    class="flex items-center justify-center gap-1 px-4 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-green-600 text-white min-w-25"
                    :class="
                      isLoading
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-sm hover:bg-green-700 hover:-translate-y-0.5'
                    "
                    :disabled="isLoading"
                    title="Save"
                    @click="saveManage(file)"
                  >
                    Save
                  </button>
                  <button
                    class="flex items-center justify-center gap-1 px-4 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-red-600 text-white min-w-25"
                    :class="
                      isLoading
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-sm hover:bg-red-700 hover:-translate-y-0.5'
                    "
                    :disabled="isLoading"
                    title="Cancel"
                    @click="cancelManage"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <!-- 普通显示状态 -->
              <div v-else class="flex flex-col gap-1">
                <span class="font-medium text-gray-700">{{ file }}</span>
                <span
                  v-if="subscriptions[file]"
                  class="text-xs text-gray-500 italic"
                >
                  {{ formatLastUpdated(subscriptions[file].lastUpdated) }}
                </span>
              </div>

              <!-- 操作按钮组 -->
              <div v-if="!isManaging" class="flex gap-2 ml-auto">
                <button
                  class="flex items-center justify-center gap-1 px-3 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-gray-600 text-white min-w-20"
                  :class="
                    isLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:shadow-sm hover:bg-gray-700 hover:-translate-y-0.5'
                  "
                  :disabled="isLoading"
                  title="Open configuration file"
                  @click.stop="openConfigFile(file, $event)"
                >
                  Open
                </button>
                <button
                  v-if="subscriptions[file]"
                  class="flex items-center justify-center gap-1 px-3 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-green-600 text-white min-w-20"
                  :class="
                    isLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:shadow-sm hover:bg-green-700 hover:-translate-y-0.5'
                  "
                  :disabled="isLoading"
                  title="Update from subscription source"
                  @click.stop="updateSubscription(file)"
                >
                  Update
                </button>
                <button
                  class="flex items-center justify-center gap-1 px-3 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-blue-600 text-white min-w-20"
                  :class="
                    isLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:shadow-sm hover:bg-blue-700 hover:-translate-y-0.5'
                  "
                  :disabled="isLoading"
                  title="Manage configuration"
                  @click.stop="startManage(file, $event)"
                >
                  Manage
                </button>
                <button
                  class="flex items-center justify-center gap-1 px-3 py-2 border-0 rounded text-sm font-medium cursor-pointer transition-all duration-200 bg-red-600 text-white min-w-20"
                  :class="
                    isLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:shadow-sm hover:bg-red-700 hover:-translate-y-0.5'
                  "
                  :disabled="isLoading"
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
