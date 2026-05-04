<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  isRefreshing: boolean;
  isGettingStatus: boolean;
  processStatus: string;
  processStatusClass: string;
}>();

defineEmits<{
  refresh: [];
  "get-status": [];
}>();

const statusTextClass = computed(() => {
  if (props.processStatusClass === "status-success") {
    return "border-green-500 bg-green-50 text-green-800";
  }

  if (props.processStatusClass === "status-error") {
    return "border-red-500 bg-red-50 text-red-800";
  }

  return "border-blue-500 bg-blue-50 text-blue-800";
});
</script>

<template>
  <div class="settings-section">
    <h3>Process Management</h3>
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-3">
        <button
          class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
          :class="
            isRefreshing
              ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
              : 'bg-green-500 hover:bg-green-600 hover:shadow-sm config-button-hover'
          "
          :disabled="isRefreshing"
          @click="$emit('refresh')"
        >
          <span
            v-if="isRefreshing"
            class="flex h-5 w-5 items-center justify-center text-base animate-spin"
            >🔄</span
          >
          <span
            v-else
            class="flex h-5 w-5 items-center justify-center text-base"
            >🔍</span
          >
          <span class="font-medium">
            {{ isRefreshing ? "Detecting..." : "Detect Process" }}
          </span>
        </button>

        <button
          class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
          :class="
            isGettingStatus
              ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
              : 'bg-blue-500 hover:bg-blue-600 hover:shadow-sm config-button-hover'
          "
          :disabled="isGettingStatus"
          @click="$emit('get-status')"
        >
          <span
            v-if="isGettingStatus"
            class="flex h-5 w-5 items-center justify-center text-base animate-pulse"
            >⏳</span
          >
          <span
            v-else
            class="flex h-5 w-5 items-center justify-center text-base"
            >📊</span
          >
          <span class="font-medium">
            {{ isGettingStatus ? "Getting Status..." : "Get Status" }}
          </span>
        </button>
      </div>

      <div
        v-if="processStatus"
        class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md"
      >
        <div
          class="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3"
        >
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full text-base"
          >
            <span v-if="processStatusClass === 'status-success'">✅</span>
            <span v-else-if="processStatusClass === 'status-error'">❌</span>
            <span v-else>ℹ️</span>
          </span>
          <span class="text-sm font-semibold text-gray-800"
            >Process Status</span
          >
        </div>
        <div class="p-4">
          <p
            class="m-0 rounded-md border-l-4 p-3 text-sm font-medium leading-relaxed"
            :class="statusTextClass"
          >
            {{ processStatus }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
