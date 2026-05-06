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
  <div class="content-card bg-gray-50/50">
    <div class="card-header bg-transparent border-b-0 pb-2">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-gray-800">Proxies</h2>
        </div>
      </div>
    </div>

    <div class="card-content flex flex-col gap-4 pt-2">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-white flex h-48 items-center justify-center text-sm text-gray-500 shadow-sm"
      >
        Start sing-box first, then open Proxies to manage groups and run tests.
      </div>

      <div
        v-else-if="clash.errorMessage.value"
        class="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm"
      >
        <p class="text-sm font-medium text-red-700">
          {{ clash.errorMessage.value }}
        </p>
        <button
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-red-700 shadow-sm"
          @click="clash.refreshOverview(true)"
        >
          Retry
        </button>
      </div>

      <template v-else>
        <!-- Proxies Control Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600 ml-2">Mode:</span>
            <select
              class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 outline-none transition-all duration-200 hover:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer min-w-32 font-medium"
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
              <option v-if="modeOptions.length === 0" value="">No modes</option>
              <option v-for="mode in modeOptions" :key="mode" :value="mode">
                {{ mode }}
              </option>
            </select>
          </div>

          <button
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="
              clash.isRefreshing.value ||
              clash.activeMode.value !== null ||
              clash.activeGroupDelay.value !== null
            "
            @click="clash.refreshOverview(true)"
          >
            <svg class="h-4 w-4" :class="{'animate-spin': clash.isRefreshing.value}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ clash.isRefreshing.value ? "Refreshing" : "Refresh" }}
          </button>
        </div>

        <div
          v-if="proxyGroups.length === 0"
          class="rounded-xl border border-dashed border-gray-300 bg-white flex h-32 items-center justify-center text-sm text-gray-500 shadow-sm"
        >
          No proxy groups were returned by the core.
        </div>

        <!-- Zashboard style list for proxy groups -->
        <div v-else class="flex flex-col gap-4 pb-4">
          <ProxyGroupRow
            v-for="group in proxyGroups"
            :key="group.name"
            :group="group"
          />
        </div>
      </template>
    </div>
  </div>
</template>
