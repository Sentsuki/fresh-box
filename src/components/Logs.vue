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
  switch (type.toLowerCase()) {
    case "trace":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    case "debug":
      return "bg-violet-100 text-violet-700 border border-violet-200";
    case "info":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "warn":
    case "warning":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "error":
    case "fatal":
    case "panic":
      return "bg-rose-100 text-rose-700 border border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
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
    <div class="card-header border-b-0 pb-2">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-gray-800">Logs</h2>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
            :class="
              statusLabel === 'Streaming'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : statusLabel === 'Connecting'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : statusLabel === 'Error'
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
            "
          >
            {{ statusLabel }}
          </span>
        </div>
      </div>
    </div>

    <div class="card-content flex min-h-0 flex-col gap-3 pt-2">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 flex h-48 items-center justify-center text-sm text-gray-500"
      >
        Start sing-box first, then open Logs to inspect the live core output.
      </div>

      <template v-else>
        <!-- Control Bar (Zashboard style) -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <select
              v-model="logs.logLevel.value"
              class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-all hover:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer min-w-28"
            >
              <option v-for="level in logs.logLevels" :key="level" :value="level">
                {{ level }}
              </option>
            </select>

            <select
              v-model="logs.typeFilter.value"
              class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-all hover:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer min-w-36"
            >
              <option value="">All categories</option>
              <option v-for="type in logs.availableTypes.value" :key="type" :value="type">
                {{ type }}
              </option>
            </select>

            <input
              v-model="logs.search.value"
              type="text"
              class="min-w-48 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-all hover:bg-gray-100 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search time / level / category / payload"
            />
          </div>

          <div class="flex items-center gap-1 pr-1">
            <button
              class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              @click="logs.downloadLogs"
              title="Export"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              @click="logs.isPaused.value = !logs.isPaused.value"
              :title="logs.isPaused.value ? 'Resume' : 'Pause'"
            >
              <svg v-if="logs.isPaused.value" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              class="rounded-lg p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              @click="logs.clearLogs"
              title="Clear"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          v-if="logs.streamError.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ logs.streamError.value }}
        </div>

        <!-- Log List -->
        <div class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="max-h-full overflow-y-auto">
            <div
              v-for="entry in logs.visibleLogs.value"
              :key="entry.seq"
              class="border-b border-gray-100 px-4 py-2 transition-colors hover:bg-gray-50/80 flex flex-col gap-1 text-[13px]"
            >
              <div class="flex items-center gap-2">
                <span class="tabular-nums text-gray-400 opacity-70 min-w-[2.5rem] font-mono">
                  {{ entry.seq.toString().padStart(4, "0") }}
                </span>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="logBadgeClass(entry.type)"
                >
                  {{ entry.type }}
                </span>
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 uppercase tracking-wide border border-gray-200 font-medium">
                  {{ entry.category }}
                </span>
                <div class="flex-1"></div>
                <span class="tabular-nums text-gray-400 opacity-80 font-mono text-[11px]">
                  {{ entry.time }}
                </span>
              </div>
              <div class="whitespace-pre-wrap break-words leading-relaxed text-gray-700 font-mono pl-[3.25rem]">
                {{ entry.payload }}
              </div>
            </div>

            <div
              v-if="logs.visibleLogs.value.length === 0"
              class="flex h-48 items-center justify-center px-6 text-center text-sm text-gray-400"
            >
              No logs matched the current filters.
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
