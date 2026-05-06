<script setup lang="ts">
import { computed, ref } from "vue";
import { useClash } from "../../composables/useClash";
import type { ClashProxyGroup } from "../../types/app";

const props = defineProps<{
  group: ClashProxyGroup;
}>();

const clash = useClash();
const isCollapsed = ref(false);

const actionDisabled = computed(
  () =>
    clash.isRefreshing.value ||
    clash.activeMode.value !== null ||
    clash.activeGroupDelay.value !== null,
);

function formatDelay(delay: number | null) {
  if (delay === null || Number.isNaN(delay)) {
    return "--";
  }

  if (delay < 0) {
    return "timeout";
  }

  return `${delay} ms`;
}

function selectionKey(nodeName: string) {
  return `${props.group.name}:${nodeName}`;
}
</script>

<template>
  <section
    class="rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md"
  >
    <div class="flex flex-wrap items-start gap-3 p-4">
      <button
        class="flex min-w-0 grow items-start gap-3 text-left"
        @click="isCollapsed = !isCollapsed"
      >
        <span
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-600"
        >
          {{ isCollapsed ? "▸" : "▾" }}
        </span>

        <div class="min-w-0 grow">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="truncate text-base font-semibold text-gray-800">
              {{ group.name }}
            </h3>
            <span
              class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600"
            >
              {{ group.kind }}
            </span>
          </div>

          <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>
              Current:
              <span class="font-medium text-gray-700">{{ group.current }}</span>
            </span>
            <span
              class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
            >
              {{ formatDelay(group.current_delay) }}
            </span>
            <span class="text-xs text-gray-400">
              {{ group.options.length }} nodes
            </span>
          </div>
        </div>
      </button>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <button
          class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="actionDisabled || clash.activeGroupDelay.value === group.name"
          @click="clash.testGroupDelay(group.name)"
        >
          {{
            clash.activeGroupDelay.value === group.name ? "测速中..." : "整组测速"
          }}
        </button>

        <button
          class="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300"
          @click="isCollapsed = !isCollapsed"
        >
          {{ isCollapsed ? "展开" : "收起" }}
        </button>
      </div>
    </div>

    <div v-if="!isCollapsed" class="border-t border-gray-200 px-4 py-4">
      <div class="overflow-x-auto pb-1">
        <div class="flex min-w-max gap-3">
          <article
            v-for="node in group.options"
            :key="`${group.name}-${node.name}`"
            class="flex w-64 shrink-0 flex-col justify-between rounded-xl border p-4 transition-all duration-200"
            :class="
              node.is_selected
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
            "
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                  {{ node.name }}
                </h4>
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
              </div>

              <p class="mt-2 text-xs text-gray-500">{{ node.kind }}</p>
              <p class="mt-1 text-xs font-medium text-gray-600">
                Delay: {{ formatDelay(node.delay) }}
              </p>
            </div>

            <div class="mt-4 flex items-center gap-2">
              <button
                class="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  node.is_selected
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                "
                :disabled="
                  actionDisabled ||
                  node.is_selected ||
                  clash.activeSelectionKey.value === selectionKey(node.name)
                "
                @click="clash.switchProxy(group.name, node.name)"
              >
                {{
                  clash.activeSelectionKey.value === selectionKey(node.name)
                    ? '切换中...'
                    : node.is_selected
                      ? '已选中'
                      : '切换'
                }}
              </button>

              <button
                class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="actionDisabled || clash.activeDelayNode.value === node.name"
                @click="clash.testDelay(node.name)"
              >
                {{ clash.activeDelayNode.value === node.name ? "测速中..." : "测速" }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
