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
  if (delay === null || Number.isNaN(delay) || delay === 0) {
    return "-- ms";
  }

  if (delay < 0) {
    return "Timeout";
  }

  return `${delay} ms`;
}

function delayColorClass(delay: number | null) {
  if (delay === null || Number.isNaN(delay) || delay === 0) {
    return "text-gray-400 bg-gray-100/50";
  }
  if (delay < 0) {
    return "text-rose-600 bg-rose-50";
  }
  if (delay < 200) {
    return "text-emerald-600 bg-emerald-50";
  }
  if (delay < 500) {
    return "text-amber-600 bg-amber-50";
  }
  return "text-orange-600 bg-orange-50";
}

function delayIndicatorClass(delay: number | null) {
  if (delay === null || Number.isNaN(delay) || delay === 0) {
    return "bg-gray-300";
  }
  if (delay < 0) {
    return "bg-rose-500";
  }
  if (delay < 200) {
    return "bg-emerald-500";
  }
  if (delay < 500) {
    return "bg-amber-500";
  }
  return "bg-orange-500";
}

function selectionKey(nodeName: string) {
  return `${props.group.name}:${nodeName}`;
}
</script>

<template>
  <section
    class="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200"
  >
    <div class="flex items-center justify-between p-3 cursor-pointer select-none border-b border-transparent hover:bg-gray-50/50 rounded-t-xl transition-colors"
         :class="{ 'border-gray-100 bg-gray-50/30': !isCollapsed }"
         @click="isCollapsed = !isCollapsed">
      <div class="flex flex-col min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="truncate text-[15px] font-semibold text-gray-800">
            {{ group.name }}
          </h3>
          <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 border border-gray-200">
            {{ group.kind }}
          </span>
        </div>
        <div class="mt-1 flex items-center gap-2 text-xs text-gray-500 truncate">
          <span class="truncate">{{ group.current }}</span>
          <span class="shrink-0 rounded px-1.5 py-0.5 font-medium" :class="delayColorClass(group.current_delay)">
            {{ formatDelay(group.current_delay) }}
          </span>
        </div>
      </div>
      
      <div class="flex items-center gap-1.5 shrink-0 ml-3">
        <button
          class="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          title="Test group delay"
          :disabled="actionDisabled || clash.activeGroupDelay.value === group.name"
          @click.stop="clash.testGroupDelay(group.name)"
        >
          <svg v-if="clash.activeGroupDelay.value === group.name" class="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
        <div class="text-gray-400">
          <svg class="h-5 w-5 transform transition-transform duration-200" :class="{ 'rotate-180': !isCollapsed }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>

    <div v-show="!isCollapsed" class="p-3 bg-gray-50/30 rounded-b-xl">
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <div
          v-for="node in group.options"
          :key="`${group.name}-${node.name}`"
          class="relative flex flex-col justify-between rounded-lg border p-2.5 transition-all duration-200 cursor-pointer overflow-hidden group"
          :class="
            node.is_selected
              ? 'border-blue-400 bg-blue-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm hover:bg-gray-50'
          "
          @click="clash.switchProxy(group.name, node.name)"
        >
          <!-- Active indicator line -->
          <div v-if="node.is_selected" class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>

          <div class="flex items-start justify-between gap-2 mb-1.5 pl-1">
            <h4 class="min-w-0 flex-1 truncate text-[13px] font-medium" :class="node.is_selected ? 'text-blue-900 font-semibold' : 'text-gray-700 group-hover:text-gray-900'">
              {{ node.name }}
            </h4>
            <div class="shrink-0 flex items-center gap-1.5 mt-0.5">
               <span class="h-1.5 w-1.5 rounded-full" :class="delayIndicatorClass(node.delay)"></span>
            </div>
          </div>
          
          <div class="flex items-center justify-between gap-2 pl-1 mt-auto">
             <span class="text-[10px] uppercase tracking-wide text-gray-400 font-medium truncate max-w-[60px]">{{ node.kind }}</span>
             <span class="text-[11px] font-medium" :class="delayColorClass(node.delay)">
                {{ formatDelay(node.delay) }}
             </span>
          </div>

          <!-- Quick Test button overlay on hover -->
          <div class="absolute inset-0 bg-white/90 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none" v-if="!node.is_selected && !actionDisabled">
             <button class="bg-gray-800 text-white rounded-md px-3 py-1.5 text-[11px] font-medium shadow-sm pointer-events-auto hover:bg-gray-700 transition-colors"
                     @click.stop="clash.testDelay(node.name)">
                {{ clash.activeDelayNode.value === node.name ? "Testing..." : "Test Delay" }}
             </button>
          </div>
          <!-- Selection loading state -->
          <div class="absolute inset-0 bg-white/60 opacity-100 flex items-center justify-center pointer-events-none" v-if="clash.activeSelectionKey.value === selectionKey(node.name)">
             <svg class="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
