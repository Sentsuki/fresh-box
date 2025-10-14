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
          <input v-model="subscriptionUrl" type="text"
            class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            placeholder="Enter subscription URL" :disabled="isLoading" @keyup.enter="addSubscription" />
          <button class="control-button subscribe-button" :disabled="!canAddSubscription"
            :class="{ disabled: !canAddSubscription }" @click="addSubscription">
            <span class="mr-3 text-lg">📥</span>
            {{ isLoading ? "Subscribing..." : "Subscribe" }}
          </button>
        </div>

        <!-- 添加配置按钮 -->
        <button class="control-button select-button" :disabled="isLoading" :class="{ disabled: isLoading }"
          @click="selectConfigFile">
          <span class="mr-3 text-lg">📁</span>
          Add Config
        </button>

        <!-- 配置列表区域 -->
        <div class="mt-6 flex-grow overflow-y-auto" style="max-height: 600px;">
          <!-- 无配置文件时的提示 -->
          <div v-if="!hasConfigFiles" class="flex flex-col items-center justify-center py-16 text-center">
            <div class="text-6xl mb-4 opacity-50">📄</div>
            <h3 class="text-xl font-semibold text-gray-700 mb-2">No Configuration Files</h3>
            <p class="text-gray-500 max-w-md">
              Add a configuration file by subscribing to a URL or selecting a local file
            </p>
          </div>

          <!-- 配置文件列表 -->
          <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));">
            <div v-for="(file, index) in configFilesDisplay" :key="configFiles[index]"
              class="bg-white border rounded-lg p-4 cursor-pointer transition-all duration-300" :class="{
                'border-blue-400 bg-blue-50 shadow-sm': configFiles[index] === selectedConfig,
                'border-orange-400 bg-orange-50 cursor-default': isManaging && managingFile === file,
                'border-gray-200 hover:shadow-sm hover:border-gray-300 hover:transform hover:-translate-y-0.5': configFiles[index] !== selectedConfig && !(isManaging && managingFile === file)
              }" @click="switchConfig(index)">
              <!-- 管理模式 -->
              <div v-if="isManaging && managingFile === file" class="space-y-4" @click.stop>
                <div>
                  <h4 class="text-lg font-semibold text-gray-800 mb-0">Edit Configuration</h4>
                </div>

                <div class="space-y-2">
                  <label class="block text-sm font-medium text-gray-700">File Name</label>
                  <input ref="renameInput" v-model="newFileName"
                    class="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    :disabled="isLoading" autofocus @keydown="handleKeydown" />
                </div>

                <div class="space-y-2">
                  <label class="block text-sm font-medium text-gray-700">Subscription URL</label>
                  <input v-model="editingSubscriptionUrl"
                    class="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Enter subscription URL (optional)" :disabled="isLoading" @keydown="handleKeydown" />
                </div>

                <div class="flex gap-3 pt-2">
                  <button
                    class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-0 cursor-pointer bg-green-600 text-white hover:bg-green-700 hover:transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" @click="saveManage(file)">
                    <span class="text-base">✓</span>
                    Save
                  </button>
                  <button
                    class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-0 cursor-pointer bg-gray-600 text-white hover:bg-gray-700 hover:transform hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" @click="cancelManage">
                    <span class="text-base">✕</span>
                    Cancel
                  </button>
                </div>
              </div>

              <!-- 普通显示模式 -->
              <div v-else class="flex items-center justify-between">
                <!-- 左侧信息区域 -->
                <div class="flex items-center gap-3 flex-grow min-w-0">
                  <div class="text-lg flex-shrink-0">
                    <span v-if="subscriptions[file]">🔗</span>
                    <span v-else>📄</span>
                  </div>
                  <div class="flex-grow min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="text-sm font-semibold text-gray-800 truncate">{{ file }}</h4>
                      <div v-if="subscriptions[file]"
                        class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex-shrink-0">
                        Subscription
                      </div>
                      <div v-if="configFiles[index] === selectedConfig"
                        class="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full flex-shrink-0">
                        Active
                      </div>
                    </div>
                    <div v-if="subscriptions[file]" class="text-xs text-gray-500">
                      {{ formatLastUpdated(subscriptions[file].lastUpdated) }}
                    </div>
                  </div>
                </div>

                <!-- 右侧操作按钮区域 -->
                <div class="flex gap-1.5 flex-shrink-0 ml-4">
                  <button
                    class="flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium transition-all duration-200 border-0 cursor-pointer bg-slate-200 text-slate-700 hover:bg-slate-300 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" title="Open configuration file" @click.stop="openConfigFile(file, $event)">
                    <span class="text-sm">👀</span>
                  </button>

                  <button v-if="subscriptions[file]"
                    class="flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium transition-all duration-200 border-0 cursor-pointer bg-emerald-200 text-emerald-700 hover:bg-emerald-300 hover:text-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" title="Update from subscription" @click.stop="updateSubscription(file)">
                    <span class="text-sm">↻</span>
                  </button>

                  <button
                    class="flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium transition-all duration-200 border-0 cursor-pointer bg-indigo-200 text-indigo-700 hover:bg-indigo-300 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" title="Edit configuration" @click.stop="startManage(file, $event)">
                    <span class="text-sm">✎</span>
                  </button>

                  <button
                    class="flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium transition-all duration-200 border-0 cursor-pointer bg-rose-200 text-rose-700 hover:bg-rose-300 hover:text-rose-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isLoading" title="Delete configuration" @click.stop="deleteConfig(file, $event)">
                    <span class="text-sm">✕</span>
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
