<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRulesPage } from "../composables/useRulesPage";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const rulesPage = useRulesPage();

const statusLabel = computed(() => {
  if (!appStore.isRunning.value) {
    return "Service stopped";
  }
  if (rulesPage.isRefreshing.value) {
    return "Refreshing";
  }
  if (rulesPage.errorMessage.value) {
    return "Error";
  }
  return "Ready";
});

const ruleBadgeClass = (disabled: boolean) =>
  disabled ? "bg-slate-200 text-slate-500 border border-slate-300" : "bg-emerald-50 text-emerald-600 border border-emerald-200";

onMounted(() => {
  if (appStore.isRunning.value) {
    void rulesPage.refreshRules(true);
  }
});

watch(
  () => appStore.isRunning.value,
  (running) => {
    if (running) {
      void rulesPage.refreshRules(true);
    }
  },
);
</script>

<template>
  <div class="content-card bg-gray-50/50">
    <div class="card-header bg-transparent border-b-0 pb-2">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-gray-800">Rules</h2>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
            :class="
              statusLabel === 'Ready'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : statusLabel === 'Refreshing'
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
        class="rounded-xl border border-dashed border-gray-300 bg-white flex h-48 items-center justify-center text-sm text-gray-500 shadow-sm"
      >
        Start sing-box first, then open Rules to inspect active routing rules.
      </div>

      <template v-else>
        <!-- Rules Control Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <!-- Tabs -->
            <div class="inline-flex rounded-lg bg-gray-100 p-1">
              <button
                class="rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
                :class="
                  rulesPage.currentTab.value === 'rules'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
                @click="rulesPage.currentTab.value = 'rules'"
              >
                Rules ({{ rulesPage.rules.value.length }})
              </button>
              <button
                v-if="rulesPage.hasProviders.value"
                class="rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
                :class="
                  rulesPage.currentTab.value === 'providers'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
                @click="rulesPage.currentTab.value = 'providers'"
              >
                Providers ({{ rulesPage.providers.value.length }})
              </button>
            </div>

            <!-- Search Input -->
            <input
              v-model="rulesPage.search.value"
              type="text"
              class="min-w-48 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition-all hover:bg-gray-100 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ml-2"
              placeholder="Search type / payload / proxy / provider"
            />
          </div>

          <div class="flex items-center gap-1 pr-1">
            <button
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!appStore.isRunning.value || rulesPage.isRefreshing.value"
              @click="rulesPage.refreshRules(true)"
            >
              <svg class="h-4 w-4" :class="{'animate-spin': rulesPage.isRefreshing.value}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ rulesPage.isRefreshing.value ? "Refreshing" : "Refresh" }}
            </button>
          </div>
        </div>

        <div
          v-if="rulesPage.errorMessage.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm"
        >
          {{ rulesPage.errorMessage.value }}
        </div>

        <!-- Rules List -->
        <div
          v-if="rulesPage.currentTab.value === 'rules'"
          class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col"
        >
          <div class="max-h-full overflow-y-auto p-2 flex flex-col gap-2">
            <div
              v-for="(rule, index) in rulesPage.visibleRules.value"
              :key="`${rule.type}-${rule.payload}-${index}`"
              class="flex items-center justify-between rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50/80 group"
            >
              <div class="flex items-center gap-4 min-w-0">
                <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[11px] font-bold text-gray-400">
                  {{ (rule.index ?? index) + 1 }}
                </div>

                <div class="min-w-0 flex flex-col">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 border border-blue-100">
                      {{ rule.type }}
                    </span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      :class="ruleBadgeClass(rule.extra?.disabled ?? rule.disabled ?? false)"
                    >
                      {{ rule.extra?.disabled ?? rule.disabled ?? false ? "Disabled" : "Enabled" }}
                    </span>
                    <span
                      v-if="typeof rule.size === 'number' && rule.size >= 0"
                      class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 border border-gray-200"
                    >
                      size {{ rule.size }}
                    </span>
                    
                    <span v-if="rule.extra && (rule.extra.hitCount || rule.extra.missCount)" class="text-[11px] text-gray-400 ml-2">
                      <span class="text-green-600">↑ {{ rule.extra.hitCount ?? 0 }}</span>
                      <span class="mx-1 opacity-50">|</span>
                      <span class="text-rose-400">↓ {{ rule.extra.missCount ?? 0 }}</span>
                    </span>
                  </div>

                  <div class="flex items-center gap-2 truncate">
                    <span class="text-[13px] font-medium text-gray-700 truncate" :title="rule.payload || 'Match All'">
                      {{ rule.payload || "Match All" }}
                    </span>
                    <span class="text-gray-300">→</span>
                    <span class="rounded bg-gray-100 px-2 py-0.5 text-[12px] font-semibold text-gray-700 border border-gray-200 truncate max-w-[200px]" :title="rule.proxy || '--'">
                      {{ rule.proxy || "--" }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity" v-if="rule.uuid || typeof rule.index === 'number'">
                <button
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  :class="
                    rule.extra?.disabled ?? rule.disabled ?? false
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50'
                  "
                  :disabled="rulesPage.activeRuleToggle.value.includes(rulesPage.getRuleToggleKey(rule, rule.index ?? index))"
                  @click="rulesPage.toggleRule(rule)"
                >
                  <span v-if="rulesPage.activeRuleToggle.value.includes(rulesPage.getRuleToggleKey(rule, rule.index ?? index))" class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1"></span>
                  {{ rule.extra?.disabled ?? rule.disabled ?? false ? "Enable" : "Disable" }}
                </button>
              </div>
            </div>

            <div
              v-if="rulesPage.visibleRules.value.length === 0"
              class="flex h-48 items-center justify-center text-sm text-gray-400"
            >
              No rules matched the current filters.
            </div>
          </div>
        </div>

        <!-- Providers List -->
        <div
          v-else
          class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col"
        >
          <div class="max-h-full overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="provider in rulesPage.visibleProviders.value"
              :key="provider.name"
              class="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
            >
              <!-- Decorative left border -->
              <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-400"></div>
              
              <div class="flex items-start justify-between gap-2 mb-3">
                <h3 class="text-sm font-semibold text-gray-800 truncate" :title="provider.name">
                  {{ provider.name }}
                </h3>
                <button
                  class="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="rulesPage.activeProviderUpdates.value.includes(provider.name)"
                  @click="rulesPage.updateProvider(provider.name)"
                  title="Update Provider"
                >
                  <svg :class="{'animate-spin text-blue-500': rulesPage.activeProviderUpdates.value.includes(provider.name)}" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <div class="flex items-center gap-2 mb-4">
                <span class="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 border border-blue-100">
                  {{ provider.behavior }}
                </span>
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 border border-gray-200">
                  {{ provider.vehicleType }}
                </span>
              </div>

              <div class="mt-auto grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-500 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">Rules</span>
                  <span class="font-medium text-gray-700">{{ provider.ruleCount }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">Type</span>
                  <span class="font-medium text-gray-700">{{ provider.type }}</span>
                </div>
                <div class="flex items-center justify-between col-span-2 border-t border-gray-100 pt-2">
                  <span class="text-gray-400">Updated</span>
                  <span class="font-medium text-gray-600">{{ provider.updatedAt || "Never" }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="rulesPage.visibleProviders.value.length === 0"
              class="col-span-full flex h-48 items-center justify-center text-sm text-gray-400"
            >
              No rule providers are available.
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
