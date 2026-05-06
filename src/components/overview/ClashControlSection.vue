<script setup lang="ts">
import { computed } from "vue";
import { useClash } from "../../composables/useClash";
import { useAppStore } from "../../stores/appStore";

const appStore = useAppStore();
const clash = useClash();

const modeOptions = computed(() => clash.overview.value?.available_modes ?? []);
const proxyGroups = computed(() => clash.overview.value?.proxy_groups ?? []);

function formatDelay(delay: number | null) {
  if (delay === null || Number.isNaN(delay)) {
    return "--";
  }

  if (delay < 0) {
    return "timeout";
  }

  return `${delay} ms`;
}

function selectionKey(groupName: string, nodeName: string) {
  return `${groupName}:${nodeName}`;
}
</script>

<template>
  <div class="settings-section">
    <div
      class="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h3 class="mb-1 border-b-0 pb-0">Clash Control</h3>
        <p class="text-sm text-gray-500">
          切换模式、切换节点，并直接通过后端调用核心测速。
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <select
          class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          :disabled="
            !appStore.isRunning.value ||
            clash.isRefreshing.value ||
            clash.activeMode.value !== null ||
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
          class="control-button min-w-0 rounded-lg bg-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
          :disabled="clash.isRefreshing.value"
          @click="clash.refreshOverview(true)"
        >
          {{ clash.isRefreshing.value ? "Refreshing..." : "Refresh" }}
        </button>
      </div>
    </div>

    <div
      v-if="!appStore.isRunning.value"
      class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500"
    >
      Start sing-box first to manage Clash mode and proxy nodes.
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
      class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500"
    >
      No proxy groups were returned by the core.
    </div>

    <div
      v-else
      class="grid gap-4"
      style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
    >
      <section
        v-for="group in proxyGroups"
        :key="group.name"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="truncate text-base font-semibold text-gray-800">
                {{ group.name }}
              </h4>
              <span
                class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600"
              >
                {{ group.kind }}
              </span>
            </div>
            <p class="mt-1 text-sm text-gray-500">
              Current: <span class="font-medium text-gray-700">{{ group.current }}</span>
            </p>
          </div>

          <div
            class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
          >
            {{ formatDelay(group.current_delay) }}
          </div>
        </div>

        <div class="space-y-2">
          <div
            v-for="node in group.options"
            :key="`${group.name}-${node.name}`"
            class="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-all duration-200"
            :class="
              node.is_selected
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
            "
          >
            <div class="min-w-0 grow">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium text-gray-800">
                  {{ node.name }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                  :class="
                    node.alive === false
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  "
                >
                  {{ node.alive === false ? "down" : "alive" }}
                </span>
                <span class="text-xs text-gray-500">{{ node.kind }}</span>
              </div>
              <p class="mt-1 text-xs text-gray-500">
                Delay: {{ formatDelay(node.delay) }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                class="rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  node.is_selected
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                "
                :disabled="
                  node.is_selected ||
                  clash.activeMode.value !== null ||
                  clash.isRefreshing.value ||
                  clash.activeSelectionKey.value === selectionKey(group.name, node.name)
                "
                @click="clash.switchProxy(group.name, node.name)"
              >
                {{
                  clash.activeSelectionKey.value === selectionKey(group.name, node.name)
                    ? "Switching..."
                    : node.is_selected
                      ? "Selected"
                      : "Switch"
                }}
              </button>

              <button
                class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="
                  clash.activeMode.value !== null ||
                  clash.isRefreshing.value ||
                  clash.activeDelayNode.value === node.name
                "
                @click="clash.testDelay(node.name)"
              >
                {{ clash.activeDelayNode.value === node.name ? "Testing..." : "测速" }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
