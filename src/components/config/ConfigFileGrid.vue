<script setup lang="ts">
import { computed, ref } from "vue";
import { formatLastUpdated } from "../../services/utils";
import { useAppStore } from "../../stores/appStore";
import { useConfigs } from "../../composables/useConfigs";

const appStore = useAppStore();
const configs = useConfigs();

const isManaging = ref(false);
const managingFile = ref("");
const newFileName = ref("");
const editingSubscriptionUrl = ref("");

const hasConfigFiles = computed(() => appStore.configFiles.value.length > 0);

function startManage(fileName: string) {
  if (appStore.isLoading.value) {
    return;
  }

  isManaging.value = true;
  managingFile.value = fileName;
  newFileName.value = fileName;
  editingSubscriptionUrl.value =
    appStore.subscriptions.value[fileName]?.url || "";
}

function cancelManage() {
  isManaging.value = false;
  managingFile.value = "";
  newFileName.value = "";
  editingSubscriptionUrl.value = "";
}

function saveManage(fileName: string) {
  if (newFileName.value !== fileName) {
    void configs.renameConfig(fileName, newFileName.value);
  }

  if (editingSubscriptionUrl.value !== appStore.subscriptions.value[fileName]?.url) {
    void configs.editSubscription(fileName, editingSubscriptionUrl.value);
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
  <div class="mt-6 grow overflow-y-auto" style="max-height: 600px">
    <div
      v-if="!hasConfigFiles"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <div class="mb-4 text-6xl opacity-50">📄</div>
      <h3 class="mb-2 text-xl font-semibold text-gray-700">
        No Configuration Files
      </h3>
      <p class="max-w-md text-gray-500">
        Add a configuration file by subscribing to a URL or selecting a local
        file
      </p>
    </div>

    <div
      v-else
      class="grid gap-4"
      style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))"
    >
      <div
        v-for="config in appStore.configFiles.value"
        :key="config.path"
        class="cursor-pointer rounded-lg border bg-white p-4 transition-all duration-300"
        :class="{
          'border-blue-400 bg-blue-50 shadow-sm':
            config.path === appStore.selectedConfigPath.value,
          'border-orange-400 bg-orange-50 cursor-default':
            isManaging && managingFile === config.displayName,
          'border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm':
            config.path !== appStore.selectedConfigPath.value &&
            !(isManaging && managingFile === config.displayName),
        }"
        @click="configs.selectConfig(config)"
      >
        <div
          v-if="isManaging && managingFile === config.displayName"
          class="space-y-4"
          @click.stop
        >
          <div>
            <h4 class="mb-0 text-lg font-semibold text-gray-800">
              Edit Configuration
            </h4>
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700"
              >File Name</label
            >
            <input
              v-model="newFileName"
              class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              :disabled="appStore.isLoading.value"
              autofocus
              @keydown="handleKeydown"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700"
              >Subscription URL</label
            >
            <input
              v-model="editingSubscriptionUrl"
              class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Enter subscription URL (optional)"
              :disabled="appStore.isLoading.value"
              @keydown="handleKeydown"
            />
          </div>

          <div class="flex gap-3 pt-2">
            <button
              class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              @click="saveManage(config.displayName)"
            >
              <span class="text-base">✓</span>
              Save
            </button>
            <button
              class="flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              @click="cancelManage"
            >
              <span class="text-base">✕</span>
              Cancel
            </button>
          </div>
        </div>

        <div v-else class="flex items-center justify-between">
          <div class="min-w-0 grow">
            <div class="mb-1 flex items-center gap-2">
              <span class="shrink-0 text-lg">
                {{
                  appStore.subscriptions.value[config.displayName] ? "🔗" : "📄"
                }}
              </span>
              <h4 class="truncate text-sm font-semibold text-gray-800">
                {{ config.displayName }}
              </h4>
              <div
                v-if="appStore.subscriptions.value[config.displayName]"
                class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
              >
                Subscription
              </div>
              <div
                v-if="config.path === appStore.selectedConfigPath.value"
                class="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
              >
                Active
              </div>
            </div>

            <div
              v-if="appStore.subscriptions.value[config.displayName]"
              class="text-xs text-gray-500"
            >
              {{
                formatLastUpdated(
                  appStore.subscriptions.value[config.displayName].lastUpdated,
                )
              }}
            </div>
          </div>

          <div class="ml-4 flex shrink-0 gap-1.5">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-md bg-slate-200 text-xs font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              title="Open configuration file"
              @click.stop="configs.openConfigFile(config.displayName)"
            >
              <span class="text-sm">↗</span>
            </button>

            <button
              v-if="appStore.subscriptions.value[config.displayName]"
              class="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-200 text-xs font-medium text-emerald-700 transition-all duration-200 hover:bg-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              title="Update from subscription"
              @click.stop="configs.updateSubscription(config.displayName)"
            >
              <span class="text-sm">↻</span>
            </button>

            <button
              class="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-200 text-xs font-medium text-indigo-700 transition-all duration-200 hover:bg-indigo-300 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              title="Edit configuration"
              @click.stop="startManage(config.displayName)"
            >
              <span class="text-sm">✎</span>
            </button>

            <button
              class="flex h-8 w-8 items-center justify-center rounded-md bg-rose-200 text-xs font-medium text-rose-700 transition-all duration-200 hover:bg-rose-300 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="appStore.isLoading.value"
              title="Delete configuration"
              @click.stop="configs.deleteConfig(config.displayName)"
            >
              <span class="text-sm">✕</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
