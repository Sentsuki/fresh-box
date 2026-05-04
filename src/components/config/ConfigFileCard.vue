<script setup lang="ts">
import { computed, ref } from "vue";
import { formatLastUpdated } from "../../services/utils";
import { useConfigs } from "../../composables/useConfigs";
import type { ConfigFileEntry, SubscriptionInfo } from "../../types/app";

const props = defineProps<{
  config: ConfigFileEntry;
  isSelected: boolean;
  subscription?: SubscriptionInfo;
  isLoading: boolean;
}>();

const configs = useConfigs();
const isManaging = ref(false);
const newFileName = ref("");
const editingSubscriptionUrl = ref("");

const cardClass = computed(() => {
  if (isManaging.value) {
    return "border-orange-400 bg-orange-50 cursor-default";
  }

  if (props.isSelected) {
    return "border-blue-400 bg-blue-50 shadow-sm";
  }

  return "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm";
});

function startManage() {
  if (props.isLoading) {
    return;
  }

  isManaging.value = true;
  newFileName.value = props.config.displayName;
  editingSubscriptionUrl.value = props.subscription?.url ?? "";
}

function cancelManage() {
  isManaging.value = false;
  newFileName.value = "";
  editingSubscriptionUrl.value = "";
}

async function saveManage() {
  const nextFileName =
    newFileName.value !== props.config.displayName
      ? newFileName.value
      : props.config.displayName;

  if (newFileName.value !== props.config.displayName) {
    await configs.renameConfig(props.config.displayName, newFileName.value);
  }

  if (editingSubscriptionUrl.value !== (props.subscription?.url ?? "")) {
    await configs.editSubscription(
      nextFileName,
      editingSubscriptionUrl.value,
    );
  }

  cancelManage();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    void saveManage();
  } else if (event.key === "Escape") {
    cancelManage();
  }
}

function handleSelect() {
  if (isManaging.value) {
    return;
  }

  void configs.selectConfig(props.config);
}
</script>

<template>
  <div
    class="cursor-pointer rounded-lg border bg-white p-4 transition-all duration-300"
    :class="cardClass"
    @click="handleSelect"
  >
    <div v-if="isManaging" class="space-y-4" @click.stop>
      <div>
        <h4 class="mb-0 text-lg font-semibold text-gray-800">
          Edit Configuration
        </h4>
      </div>

      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">File Name</label>
        <input
          v-model="newFileName"
          class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          :disabled="isLoading"
          autofocus
          @keydown="handleKeydown"
        />
      </div>

      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">
          Subscription URL
        </label>
        <input
          v-model="editingSubscriptionUrl"
          class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          placeholder="Enter subscription URL (optional)"
          :disabled="isLoading"
          @keydown="handleKeydown"
        />
      </div>

      <div class="flex gap-3 pt-2">
        <button
          class="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          @click="saveManage"
        >
          <span class="text-base">✓</span>
          Save
        </button>
        <button
          class="flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
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
            {{ subscription ? "🔗" : "📄" }}
          </span>
          <h4 class="truncate text-sm font-semibold text-gray-800">
            {{ config.displayName }}
          </h4>
          <div
            v-if="subscription"
            class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
          >
            Subscription
          </div>
          <div
            v-if="isSelected"
            class="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
          >
            Active
          </div>
        </div>

        <div v-if="subscription" class="text-xs text-gray-500">
          {{ formatLastUpdated(subscription.lastUpdated) }}
        </div>
      </div>

      <div class="ml-4 flex shrink-0 gap-1.5">
        <button
          class="flex h-8 w-8 items-center justify-center rounded-md bg-slate-200 text-xs font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          title="Open configuration file"
          @click.stop="configs.openConfigFile(config.displayName)"
        >
          <span class="text-sm">↗</span>
        </button>

        <button
          v-if="subscription"
          class="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-200 text-xs font-medium text-emerald-700 transition-all duration-200 hover:bg-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          title="Update from subscription"
          @click.stop="configs.updateSubscription(config.displayName)"
        >
          <span class="text-sm">↻</span>
        </button>

        <button
          class="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-200 text-xs font-medium text-indigo-700 transition-all duration-200 hover:bg-indigo-300 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          title="Edit configuration"
          @click.stop="startManage"
        >
          <span class="text-sm">✎</span>
        </button>

        <button
          class="flex h-8 w-8 items-center justify-center rounded-md bg-rose-200 text-xs font-medium text-rose-700 transition-all duration-200 hover:bg-rose-300 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          title="Delete configuration"
          @click.stop="configs.deleteConfig(config.displayName)"
        >
          <span class="text-sm">✕</span>
        </button>
      </div>
    </div>
  </div>
</template>
