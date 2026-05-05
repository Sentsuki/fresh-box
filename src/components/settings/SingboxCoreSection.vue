<script setup lang="ts">
import type {
  CoreUpdateProgressEvent,
  SingboxCoreOption,
  SingboxCoreStatus,
} from "../../types/app";

defineProps<{
  coreStatus: SingboxCoreStatus | null;
  coreStatusError: string;
  coreUpdateProgress: CoreUpdateProgressEvent | null;
  currentCoreLabel: string;
  selectedCoreLabel: string;
  selectedCoreOptionKey: string;
  coreStatusText: string;
  coreStatusBadgeClass: string;
  isRefreshingCoreStatus: boolean;
  isUpdatingCore: boolean;
  updateCoreButtonLabel: string;
  availableOptions: SingboxCoreOption[];
}>();

defineEmits<{
  refresh: [];
  apply: [];
  "update:selected-core-option-key": [value: string];
}>();
</script>

<template>
  <div class="settings-section">
    <h3>Sing-box Core</h3>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 text-sm text-gray-500">
        Stable and Testing each keep the latest 3 available releases.
      </p>
      <span
        class="rounded-full px-3 py-1 text-xs font-semibold"
        :class="coreStatusBadgeClass"
      >
        {{ coreStatusText }}
      </span>
    </div>

    <div class="mt-4 flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
            Current Core
          </p>
          <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
            {{ currentCoreLabel }}
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
            Selected Target
          </p>
          <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
            {{ selectedCoreLabel }}
          </p>
        </div>
      </div>

      <div
        v-if="coreStatus?.is_running"
        class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        You can switch to another installed core while sing-box is running.
        Restart sing-box after the change to start using the selected version.
      </div>

      <div
        v-if="coreStatusError"
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ coreStatusError }}
      </div>

      <div
        v-if="coreUpdateProgress"
        class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3"
      >
        <div
          class="flex items-center justify-between gap-3 text-sm text-blue-900"
        >
          <span class="font-medium">{{ coreUpdateProgress.message }}</span>
          <span class="text-xs font-semibold"
            >{{ coreUpdateProgress.percent }}%</span
          >
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
          <div
            class="h-full rounded-full bg-blue-600 transition-all duration-300"
            :style="{ width: `${coreUpdateProgress.percent}%` }"
          />
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <label
          class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Core Channel / Version
        </label>
        <select
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-500"
          :value="selectedCoreOptionKey"
          :disabled="
            isRefreshingCoreStatus || isUpdatingCore || !availableOptions.length
          "
          @change="
            $emit(
              'update:selected-core-option-key',
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option
            v-for="option in availableOptions"
            :key="`${option.channel}:${option.version}`"
            :value="`${option.channel}:${option.version}`"
          >
            {{ option.label }}{{ option.installed ? " (Installed)" : ""
            }}{{ option.is_active ? " (Active)" : "" }}
          </option>
        </select>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
          :class="
            isRefreshingCoreStatus
              ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
              : 'bg-slate-500 hover:bg-slate-600 hover:shadow-sm config-button-hover'
          "
          :disabled="isRefreshingCoreStatus || isUpdatingCore"
          @click="$emit('refresh')"
        >
          <span class="flex h-5 w-5 items-center justify-center text-base"
            >🧭</span
          >
          <span class="font-medium">
            {{ isRefreshingCoreStatus ? "Checking..." : "Refresh Releases" }}
          </span>
        </button>

        <button
          class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
          :class="
            isUpdatingCore
              ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
              : 'bg-violet-600 hover:bg-violet-700 hover:shadow-sm config-button-hover'
          "
          :disabled="
            isUpdatingCore || isRefreshingCoreStatus || !selectedCoreOptionKey
          "
          @click="$emit('apply')"
        >
          <span class="flex h-5 w-5 items-center justify-center text-base"
            >⚙️</span
          >
          <span class="font-medium">
            {{ updateCoreButtonLabel }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
