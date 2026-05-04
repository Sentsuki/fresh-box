<script setup lang="ts">
import type { SingboxCoreStatus } from "../../types/app";

defineProps<{
  coreStatus: SingboxCoreStatus | null;
  coreStatusError: string;
  coreStatusText: string;
  coreStatusBadgeClass: string;
  isRefreshingCoreStatus: boolean;
  isUpdatingCore: boolean;
  updateCoreButtonLabel: string;
}>();

defineEmits<{
  refresh: [];
  update: [];
}>();
</script>

<template>
  <div class="settings-section">
    <h3>Sing-box Core</h3>

    <div
      class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
      >
        <div>
          <p class="m-0 text-sm font-semibold text-gray-800">Sing-box Core</p>
          <p class="m-0 mt-1 text-xs text-gray-500">
            Syncs with the latest SagerNet/sing-box Windows amd64 release.
          </p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="coreStatusBadgeClass"
        >
          {{ coreStatusText }}
        </span>
      </div>

      <div class="flex flex-col gap-4 p-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
              Current Version
            </p>
            <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
              {{ coreStatus?.current_version || "Not installed" }}
            </p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
              Latest Version
            </p>
            <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
              {{ coreStatus?.latest_version || "Unknown" }}
            </p>
          </div>
        </div>

        <div
          v-if="coreStatus?.is_running"
          class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          The latest core can still be downloaded now, but you need to stop
          sing-box before it can be unpacked and applied.
        </div>

        <div
          v-if="coreStatusError"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ coreStatusError }}
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
            <span
              v-if="isRefreshingCoreStatus"
              class="flex h-5 w-5 items-center justify-center text-base animate-spin"
              >🔄</span
            >
            <span
              v-else
              class="flex h-5 w-5 items-center justify-center text-base"
              >🧭</span
            >
            <span class="font-medium">
              {{ isRefreshingCoreStatus ? "Checking..." : "Check Latest" }}
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
              isUpdatingCore || isRefreshingCoreStatus || !coreStatus?.latest_version
            "
            @click="$emit('update')"
          >
            <span
              v-if="isUpdatingCore"
              class="flex h-5 w-5 items-center justify-center text-base animate-spin"
              >⬇️</span
            >
            <span
              v-else
              class="flex h-5 w-5 items-center justify-center text-base"
              >⚙️</span
            >
            <span class="font-medium">
              {{ updateCoreButtonLabel }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
