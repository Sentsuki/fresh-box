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
  disabled ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700";

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
  <div class="content-card">
    <div class="card-header">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2>Rules</h2>
          <p class="mt-1 text-sm text-gray-500">
            查看核心规则、搜索匹配项，并在支持时管理规则集与规则开关。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="
              statusLabel === 'Ready'
                ? 'bg-emerald-100 text-emerald-700'
                : statusLabel === 'Refreshing'
                  ? 'bg-amber-100 text-amber-700'
                  : statusLabel === 'Error'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
            "
          >
            {{ statusLabel }}
          </span>
          <button
            class="rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            :disabled="!appStore.isRunning.value || rulesPage.isRefreshing.value"
            @click="rulesPage.refreshRules(true)"
          >
            {{ rulesPage.isRefreshing.value ? "Refreshing..." : "Refresh" }}
          </button>
        </div>
      </div>
    </div>

    <div class="card-content flex min-h-0 flex-col gap-4">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        Start sing-box first, then open Rules to inspect active routing rules.
      </div>

      <template v-else>
        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <div class="inline-flex rounded-lg bg-gray-100 p-1">
              <button
                class="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200"
                :class="
                  rulesPage.currentTab.value === 'rules'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                "
                @click="rulesPage.currentTab.value = 'rules'"
              >
                Rules ({{ rulesPage.rules.value.length }})
              </button>
              <button
                v-if="rulesPage.hasProviders.value"
                class="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200"
                :class="
                  rulesPage.currentTab.value === 'providers'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                "
                @click="rulesPage.currentTab.value = 'providers'"
              >
                Providers ({{ rulesPage.providers.value.length }})
              </button>
            </div>

            <input
              v-model="rulesPage.search.value"
              type="text"
              class="min-w-64 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search type / payload / proxy / provider"
            />
          </div>
        </div>

        <div
          v-if="rulesPage.errorMessage.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ rulesPage.errorMessage.value }}
        </div>

        <div
          v-if="rulesPage.currentTab.value === 'rules'"
          class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div class="max-h-full overflow-y-auto">
            <div
              v-for="(rule, index) in rulesPage.visibleRules.value"
              :key="`${rule.type}-${rule.payload}-${index}`"
              class="border-b border-gray-100 px-4 py-4 transition-all duration-200 hover:bg-gray-50"
            >
              <div class="flex flex-wrap items-start gap-3">
                <div
                  class="flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-600"
                >
                  {{ (rule.index ?? index) + 1 }}
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
                    >
                      {{ rule.type }}
                    </span>
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      :class="ruleBadgeClass(rule.extra?.disabled ?? rule.disabled ?? false)"
                    >
                      {{
                        rule.extra?.disabled ?? rule.disabled ?? false
                          ? "Disabled"
                          : "Enabled"
                      }}
                    </span>
                    <span
                      v-if="typeof rule.size === 'number' && rule.size >= 0"
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      size {{ rule.size }}
                    </span>
                  </div>

                  <p class="mt-2 break-words text-sm font-medium text-gray-800">
                    {{ rule.payload || "--" }}
                  </p>
                  <p class="mt-2 text-xs text-gray-500">
                    Proxy:
                    <span class="font-medium text-gray-700">{{ rule.proxy || "--" }}</span>
                  </p>
                  <p
                    v-if="rule.extra && (rule.extra.hitCount || rule.extra.missCount)"
                    class="mt-1 text-xs text-gray-500"
                  >
                    Hit {{ rule.extra.hitCount ?? 0 }} / Miss
                    {{ rule.extra.missCount ?? 0 }}
                  </p>
                </div>

                <button
                  v-if="rule.uuid || typeof rule.index === 'number'"
                  class="rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                  :class="
                    rule.extra?.disabled ?? rule.disabled ?? false
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  "
                  :disabled="
                    rulesPage.activeRuleToggle.value.includes(
                      rulesPage.getRuleToggleKey(rule, rule.index ?? index),
                    )
                  "
                  @click="rulesPage.toggleRule(rule)"
                >
                  {{
                    rulesPage.activeRuleToggle.value.includes(
                      rulesPage.getRuleToggleKey(rule, rule.index ?? index),
                    )
                      ? "Applying..."
                      : rule.extra?.disabled ?? rule.disabled ?? false
                        ? "Enable"
                        : "Disable"
                  }}
                </button>
              </div>
            </div>

            <div
              v-if="rulesPage.visibleRules.value.length === 0"
              class="flex h-64 items-center justify-center px-6 text-center text-sm text-gray-500"
            >
              No rules matched the current filters.
            </div>
          </div>
        </div>

        <div
          v-else
          class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div class="max-h-full overflow-y-auto">
            <div
              v-for="provider in rulesPage.visibleProviders.value"
              :key="provider.name"
              class="border-b border-gray-100 px-4 py-4 transition-all duration-200 hover:bg-gray-50"
            >
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-sm font-semibold text-gray-800">
                      {{ provider.name }}
                    </h3>
                    <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {{ provider.behavior }}
                    </span>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {{ provider.vehicleType }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Rules: {{ provider.ruleCount }}</span>
                    <span>Format: {{ provider.format }}</span>
                    <span>Type: {{ provider.type }}</span>
                    <span>Updated: {{ provider.updatedAt || "--" }}</span>
                  </div>
                </div>

                <button
                  class="rounded-lg bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="rulesPage.activeProviderUpdates.value.includes(provider.name)"
                  @click="rulesPage.updateProvider(provider.name)"
                >
                  {{
                    rulesPage.activeProviderUpdates.value.includes(provider.name)
                      ? "Updating..."
                      : "Update"
                  }}
                </button>
              </div>
            </div>

            <div
              v-if="rulesPage.visibleProviders.value.length === 0"
              class="flex h-64 items-center justify-center px-6 text-center text-sm text-gray-500"
            >
              No rule providers are available for the current core.
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
