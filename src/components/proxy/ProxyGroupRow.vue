<script setup lang="ts">
import { computed, ref } from "vue";
import { useClash } from "../../composables/useClash";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

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
const availableCount = computed(
  () => props.group.options.filter((node) => node.alive !== false).length,
);
const previewNodes = computed(() => props.group.options.slice(0, 6));

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

function formatNodeMeta(node: ClashProxyNode) {
  const parts = [node.kind];
  if (node.alive === false) {
    parts.push("down");
  } else if (node.alive === true) {
    parts.push("alive");
  }

  return parts.join(" · ");
}

function handleNodeClick(node: ClashProxyNode) {
  if (
    actionDisabled.value ||
    node.is_selected ||
    clash.activeSelectionKey.value === selectionKey(node.name)
  ) {
    return;
  }

  void clash.switchProxy(props.group.name, node.name);
}
</script>

<template>
  <section
    class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md"
  >
    <div class="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-4">
      <div class="flex items-start justify-between gap-3">
        <button class="min-w-0 flex-1 text-left" @click="isCollapsed = !isCollapsed">
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-sm text-slate-500 shadow-sm"
            >
              {{ isCollapsed ? "▸" : "▾" }}
            </span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3
                  class="min-w-0 text-base font-semibold text-slate-800"
                  style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI', sans-serif"
                >
                  {{ group.name }}
                </h3>
                <span
                  class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {{ group.kind }}
                </span>
                <span
                  class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  {{ availableCount }}/{{ group.options.length }} alive
                </span>
              </div>

              <div class="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
                <span class="shrink-0">Current</span>
                <span
                  class="min-w-0 max-w-full rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm"
                  style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI', sans-serif"
                >
                  {{ group.current }}
                </span>
                <span
                  class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700"
                >
                  {{ formatDelay(group.current_delay) }}
                </span>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="node in previewNodes"
                  :key="`${group.name}-preview-${node.name}`"
                  class="rounded-full border px-2.5 py-1 text-xs"
                  :class="
                    node.is_selected
                      ? 'border-blue-200 bg-blue-100 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  "
                  style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI', sans-serif"
                >
                  {{ node.name }}
                </span>
                <span
                  v-if="group.options.length > previewNodes.length"
                  class="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400"
                >
                  +{{ group.options.length - previewNodes.length }}
                </span>
              </div>
            </div>
          </div>
        </button>

        <div class="flex shrink-0 items-center gap-2">
          <button
            class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="actionDisabled || clash.activeGroupDelay.value === group.name"
            @click="clash.testGroupDelay(group.name)"
          >
            {{
              clash.activeGroupDelay.value === group.name
                ? "测速中..."
                : "整组测速"
            }}
          </button>

          <button
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-all duration-200 hover:bg-slate-50"
            @click="isCollapsed = !isCollapsed"
          >
            {{ isCollapsed ? "展开" : "收起" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="!isCollapsed" class="p-4">
      <div
        class="grid gap-2"
        style="grid-template-columns: repeat(auto-fit, minmax(148px, 1fr))"
      >
        <article
          v-for="node in group.options"
          :key="`${group.name}-${node.name}`"
          class="group relative flex min-h-28 flex-col items-start rounded-2xl border px-3 py-3 text-left transition-all duration-200"
          :class="
            node.is_selected
              ? 'border-blue-300 bg-blue-50 shadow-sm'
              : clash.activeSelectionKey.value === selectionKey(node.name)
                ? 'border-amber-300 bg-amber-50'
                : actionDisabled
                  ? 'border-slate-200 bg-slate-100'
                  : 'cursor-pointer border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
          "
          :aria-disabled="
            actionDisabled || clash.activeSelectionKey.value === selectionKey(node.name)
          "
          :tabindex="
            actionDisabled || clash.activeSelectionKey.value === selectionKey(node.name)
              ? -1
              : 0
          "
          @click="handleNodeClick(node)"
          @keydown.enter.prevent="handleNodeClick(node)"
          @keydown.space.prevent="handleNodeClick(node)"
        >
          <div class="flex w-full items-start justify-between gap-2">
            <div class="min-w-0">
              <div
                class="line-clamp-2 text-sm font-semibold text-slate-800"
                style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI', sans-serif; word-break: break-word"
              >
                {{ node.name }}
              </div>
              <div class="mt-1 text-xs text-slate-500">
                {{ formatNodeMeta(node) }}
              </div>
            </div>

            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              :class="
                node.is_selected
                  ? 'bg-blue-600 text-white'
                  : node.alive === false
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-emerald-100 text-emerald-700'
              "
            >
              {{
                node.is_selected
                  ? "已选中"
                  : node.alive === false
                    ? "down"
                    : "alive"
              }}
            </span>
          </div>

          <div class="mt-3 flex w-full items-center justify-between gap-2">
            <span class="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
              {{ formatDelay(node.delay) }}
            </span>

            <button
              class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-all duration-200 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="actionDisabled || clash.activeDelayNode.value === node.name"
              @click.stop="clash.testDelay(node.name)"
            >
              {{
                clash.activeDelayNode.value === node.name
                  ? "测速中..."
                  : "测速"
              }}
            </button>
          </div>

          <div
            v-if="!node.is_selected"
            class="mt-2 text-xs text-slate-400 transition-colors duration-200 group-hover:text-slate-500"
          >
            点击卡片切换到该节点
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
