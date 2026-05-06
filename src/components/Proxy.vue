<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ProxyGroupRow from "./proxy/ProxyGroupRow.vue";
import { useClash } from "../composables/useClash";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const clash = useClash();
const search = ref("");

const modeOptions = computed(() => clash.overview.value?.available_modes ?? []);
const proxyGroups = computed(() => clash.overview.value?.proxy_groups ?? []);
const filteredProxyGroups = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase();
  if (!keyword) {
    return proxyGroups.value;
  }

  return proxyGroups.value.filter((group) => {
    const haystacks = [
      group.name,
      group.kind,
      group.current,
      ...group.options.map((node) => node.name),
    ];

    return haystacks.some((value) => value.toLocaleLowerCase().includes(keyword));
  });
});
const availableNodeCount = computed(
  () =>
    proxyGroups.value.flatMap((group) => group.options).filter((node) => node.alive !== false)
      .length,
);
const totalNodeCount = computed(
  () => proxyGroups.value.flatMap((group) => group.options).length,
);
const readyGroupCount = computed(
  () => proxyGroups.value.filter((group) => group.current_delay !== null && group.current_delay >= 0)
    .length,
);

onMounted(() => {
  if (appStore.isRunning.value && !clash.hasData.value && !clash.isRefreshing.value) {
    void clash.refreshOverview(true);
  }
});
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2>Proxy</h2>
          <p class="mt-1 text-sm text-gray-500">
            参考 zashboard 重排为更紧凑的代理面板，支持直接点选节点、整组测速和更清晰的分组浏览。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

    <div class="card-content flex min-h-0 flex-col gap-4">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        Start sing-box first, then open Proxy to manage groups and run tests.
      </div>

      <div
        v-else-if="clash.errorMessage.value"
        class="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4"
      >
        <p class="text-sm font-medium text-red-700">
          {{ clash.errorMessage.value }}
        </p>
        <button
          class="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-red-700"
          @click="clash.refreshOverview(true)"
        >
          Retry
        </button>
      </div>

      <div
        v-else-if="proxyGroups.length === 0"
        class="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        No proxy groups were returned by the core.
      </div>

      <template v-else>
        <div class="grid gap-4 md:grid-cols-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Mode</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="mode in modeOptions"
                :key="mode"
                class="rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  clash.overview.value?.current_mode === mode
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                "
                :disabled="
                  clash.isRefreshing.value ||
                  clash.activeMode.value !== null ||
                  clash.activeGroupDelay.value !== null ||
                  clash.overview.value?.current_mode === mode
                "
                @click="clash.changeMode(mode)"
              >
                {{
                  clash.activeMode.value === mode
                    ? `${mode}...`
                    : mode
                }}
              </button>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Groups</p>
            <p class="mt-2 text-2xl font-semibold text-slate-800">
              {{ proxyGroups.length }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              {{ readyGroupCount }} groups with delay data
            </p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Nodes</p>
            <p class="mt-2 text-2xl font-semibold text-slate-800">
              {{ totalNodeCount }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              Compact grid layout, no horizontal scrolling
            </p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Available</p>
            <p class="mt-2 text-2xl font-semibold text-slate-800">
              {{ availableNodeCount }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              Alive nodes across all switchable groups
            </p>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <input
              v-model="search"
              type="text"
              class="min-w-72 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search group / node / current selection"
            />

            <span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              {{ filteredProxyGroups.length }} / {{ proxyGroups.length }} groups
            </span>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <ProxyGroupRow
            v-for="group in filteredProxyGroups"
            :key="group.name"
            :group="group"
          />
        </div>

        <div
          v-if="filteredProxyGroups.length === 0"
          class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500"
        >
          No proxy groups matched your search.
        </div>
      </template>
    </div>
  </div>
</template>
