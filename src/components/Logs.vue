<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useLogsStream } from "../composables/useLogsStream";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const logs = useLogsStream();

const statusLabel = computed(() => {
  if (!appStore.isRunning.value) {
    return "Service stopped";
  }
  if (logs.streamStatus.value === "connected") {
    return "Streaming";
  }
  if (logs.streamStatus.value === "connecting") {
    return "Connecting";
  }
  if (logs.streamStatus.value === "error") {
    return "Error";
  }
  return "Disconnected";
});

const logBadgeClass = (type: string) => {
  switch (type) {
    case "trace":
      return "bg-slate-100 text-slate-700";
    case "debug":
      return "bg-violet-100 text-violet-700";
    case "info":
      return "bg-blue-100 text-blue-700";
    case "warn":
    case "warning":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-rose-100 text-rose-700";
  }
};

onMounted(() => {
  if (appStore.isRunning.value) {
    logs.startStream();
  }
});

watch(
  () => appStore.isRunning.value,
  (running) => {
    if (running) {
      logs.startStream();
    } else {
      logs.stopStream(true);
    }
  },
);

watch(
  () => logs.logLevel.value,
  () => {
    if (appStore.isRunning.value) {
      logs.restartStream();
    }
  },
);

onBeforeUnmount(() => {
  logs.stopStream(false);
});
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2>Logs</h2>
          <p class="mt-1 text-sm text-gray-500">
            实时日志流、级别筛选、类别筛选、暂停、清空和导出。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="
              statusLabel === 'Streaming'
                ? 'bg-emerald-100 text-emerald-700'
                : statusLabel === 'Connecting'
                  ? 'bg-amber-100 text-amber-700'
                  : statusLabel === 'Error'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
            "
          >
            {{ statusLabel }}
          </span>
          <button
            class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!appStore.isRunning.value"
            @click="logs.isPaused.value = !logs.isPaused.value"
          >
            {{ logs.isPaused.value ? "Resume" : "Pause" }}
          </button>
          <button
            class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300"
            @click="logs.downloadLogs"
          >
            Export
          </button>
          <button
            class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-rose-700"
            @click="logs.clearLogs"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <div class="card-content flex min-h-0 flex-col gap-4">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        Start sing-box first, then open Logs to inspect the live core output.
      </div>

      <template v-else>
        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <select
              v-model="logs.logLevel.value"
              class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option v-for="level in logs.logLevels" :key="level" :value="level">
                {{ level }}
              </option>
            </select>

            <select
              v-model="logs.typeFilter.value"
              class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All categories</option>
              <option v-for="type in logs.availableTypes.value" :key="type" :value="type">
                {{ type }}
              </option>
            </select>

            <input
              v-model="logs.search.value"
              type="text"
              class="min-w-64 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search time / level / category / payload"
            />
          </div>
        </div>

        <div
          v-if="logs.streamError.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ logs.streamError.value }}
        </div>

        <div class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="max-h-full overflow-y-auto">
            <div
              v-for="entry in logs.visibleLogs.value"
              :key="entry.seq"
              class="border-b border-gray-100 px-4 py-3 transition-all duration-200 hover:bg-gray-50"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-semibold tabular-nums text-gray-400">
                  #{{ entry.seq.toString().padStart(4, "0") }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="logBadgeClass(entry.type)"
                >
                  {{ entry.type }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {{ entry.category }}
                </span>
                <span class="ml-auto text-xs tabular-nums text-gray-400">
                  {{ entry.time }}
                </span>
              </div>
              <pre class="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{{
                entry.payload
              }}</pre>
            </div>

            <div
              v-if="logs.visibleLogs.value.length === 0"
              class="flex h-64 items-center justify-center px-6 text-center text-sm text-gray-500"
            >
              No logs matched the current filters.
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
