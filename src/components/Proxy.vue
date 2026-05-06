<script setup lang="ts">
import { computed, onMounted } from "vue";
import ProxyGroupRow from "./proxy/ProxyGroupRow.vue";
import { useClash } from "../composables/useClash";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const clash = useClash();

const modeOptions = computed(() => clash.overview.value?.available_modes ?? []);
const proxyGroups = computed(() => clash.overview.value?.proxy_groups ?? []);

onMounted(() => {
  if (appStore.isRunning.value && !clash.hasData.value && !clash.isRefreshing.value) {
    void clash.refreshOverview(true);
  }
});
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2>Proxy</h2>
          <p class="mt-1 text-sm text-gray-500">
            独立管理 Clash Mode、节点切换和分组测速。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <select
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            :disabled="
              !appStore.isRunning.value ||
              clash.isRefreshing.value ||
              clash.activeMode.value !== null ||
              clash.activeGroupDelay.value !== null ||
              modeOptions.length === 0
            "
            :value="clash.overview.value?.current_mode ?? ''"
            @change="clash.changeMode(($event.target as HTMLSelectElement).value)"
          >
            <option v-if="modeOptions.length === 0" value="">No modes available</option>
            <option v-for="mode in modeOptions" :key="mode" :value="mode">
              {{ mode }}
            </option>
          </select>

          <button
            class="rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="
              clash.isRefreshing.value ||
              clash.activeMode.value !== null ||
              clash.activeGroupDelay.value !== null
            "
            @click="clash.refreshOverview(true)"
          >
            {{ clash.isRefreshing.value ? "Refreshing..." : "Refresh" }}
          </button>
        </div>
      </div>
    </div>

    <div class="card-content">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        Start sing-box first, then open Proxy to manage groups and run tests.
      </div>

      <div
        v-else-if="clash.errorMessage.value"
        class="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p class="text-sm font-medium text-red-700">
          {{ clash.errorMessage.value }}
        </p>
        <button
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-red-700"
          @click="clash.refreshOverview(true)"
        >
          Retry
        </button>
      </div>

      <div
        v-else-if="proxyGroups.length === 0"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        No proxy groups were returned by the core.
      </div>

      <div v-else class="flex flex-col gap-4">
        <ProxyGroupRow
          v-for="group in proxyGroups"
          :key="group.name"
          :group="group"
        />
      </div>
    </div>
  </div>
</template>
