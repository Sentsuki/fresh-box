<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import ConnectionDetailsModal from "./connections/ConnectionDetailsModal.vue";
import { useConnectionsStream } from "../composables/useConnectionsStream";
import { useAppStore } from "../stores/appStore";
import { formatBytes, formatSpeed } from "../services/utils";

const appStore = useAppStore();
const connections = useConnectionsStream();

const statusLabel = computed(() => {
  if (!appStore.isRunning.value) {
    return "Service stopped";
  }
  if (connections.streamStatus.value === "connected") {
    return "Live";
  }
  if (connections.streamStatus.value === "connecting") {
    return "Connecting";
  }
  if (connections.streamStatus.value === "error") {
    return "Error";
  }
  return "Disconnected";
});

const canCloseVisible = computed(
  () =>
    connections.currentTab.value === "active" &&
    connections.visibleConnections.value.length > 0,
);

onMounted(() => {
  if (appStore.isRunning.value) {
    connections.startStream();
  }
});

watch(
  () => appStore.isRunning.value,
  (running) => {
    if (running) {
      connections.startStream();
    } else {
      connections.stopStream(true);
    }
  },
);

onBeforeUnmount(() => {
  connections.stopStream(false);
});
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2>Connections</h2>
          <p class="mt-1 text-sm text-gray-500">
            实时查看连接、筛选、暂停刷新、关闭单条或批量连接。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="
              statusLabel === 'Live'
                ? 'bg-emerald-100 text-emerald-700'
                : statusLabel === 'Connecting'
                  ? 'bg-amber-100 text-amber-700'
                  : statusLabel === 'Error'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
            "
          >
            {{ statusLabel }}
          </span>
          <button
            class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!appStore.isRunning.value"
            @click="connections.isPaused.value = !connections.isPaused.value"
          >
            {{ connections.isPaused.value ? "Resume" : "Pause" }}
          </button>
          <button
            class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canCloseVisible || connections.isDisconnectingAll.value"
            @click="connections.disconnectVisibleConnections"
          >
            {{
              connections.isDisconnectingAll.value
                ? "Closing..."
                : connections.currentTab.value === "active"
                  ? "Close Visible"
                  : "Close"
            }}
          </button>
        </div>
      </div>
    </div>

    <div class="card-content flex min-h-0 flex-col gap-4">
      <div
        v-if="!appStore.isRunning.value"
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-500"
      >
        Start sing-box first, then open Connections to inspect live traffic.
      </div>

      <template v-else>
        <div class="grid gap-4 md:grid-cols-4">
          <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Active</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800">
              {{ connections.activeCount.value }}
            </p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Closed</p>
            <p class="mt-2 text-2xl font-semibold text-gray-800">
              {{ connections.closedCount.value }}
            </p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Download</p>
            <p class="mt-2 text-xl font-semibold text-gray-800">
              {{ formatBytes(connections.totalDownload.value) }}
            </p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Upload</p>
            <p class="mt-2 text-xl font-semibold text-gray-800">
              {{ formatBytes(connections.totalUpload.value) }}
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <div class="inline-flex rounded-lg bg-gray-100 p-1">
              <button
                class="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200"
                :class="
                  connections.currentTab.value === 'active'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                "
                @click="connections.currentTab.value = 'active'"
              >
                Active
              </button>
              <button
                class="rounded-md px-3 py-2 text-sm font-medium transition-all duration-200"
                :class="
                  connections.currentTab.value === 'closed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                "
                @click="connections.currentTab.value = 'closed'"
              >
                Closed
              </button>
            </div>

            <input
              v-model="connections.search.value"
              type="text"
              class="min-w-64 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search host / IP / rule / chain / process"
            />

            <select
              v-model="connections.sortKey.value"
              class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="downloadSpeed">Sort by Download Speed</option>
              <option value="uploadSpeed">Sort by Upload Speed</option>
              <option value="download">Sort by Download</option>
              <option value="upload">Sort by Upload</option>
              <option value="host">Sort by Host</option>
              <option value="start">Sort by Start Time</option>
            </select>

            <button
              class="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300"
              @click="
                connections.sortDirection.value =
                  connections.sortDirection.value === 'asc' ? 'desc' : 'asc'
              "
            >
              {{ connections.sortDirection.value === "asc" ? "Asc" : "Desc" }}
            </button>

            <button
              v-if="connections.currentTab.value === 'closed'"
              class="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300"
              @click="connections.clearClosedConnections"
            >
              Clear Closed
            </button>
          </div>
        </div>

        <div
          v-if="connections.streamError.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ connections.streamError.value }}
        </div>

        <div class="min-h-0 grow overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div
            class="grid grid-cols-[minmax(220px,2fr)_120px_120px_minmax(180px,1.5fr)_minmax(140px,1fr)_120px_110px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            <span>Host / Destination</span>
            <span>Download</span>
            <span>Upload</span>
            <span>Chain / Rule</span>
            <span>Source / Process</span>
            <span>Connected</span>
            <span>Actions</span>
          </div>

          <div class="max-h-full overflow-y-auto">
            <button
              v-for="connection in connections.visibleConnections.value"
              :key="connection.id"
              class="grid w-full grid-cols-[minmax(220px,2fr)_120px_120px_minmax(180px,1.5fr)_minmax(140px,1fr)_120px_110px] gap-3 border-b border-gray-100 px-4 py-4 text-left transition-all duration-200 hover:bg-blue-50"
              @click="connections.openDetails(connection)"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-gray-800">
                  {{ connections.getConnectionHost(connection) }}
                </p>
                <p class="mt-1 text-xs text-gray-500">
                  {{ connection.metadata.destinationIP }}:{{
                    connection.metadata.destinationPort
                  }}
                </p>
              </div>

              <div>
                <p class="text-sm font-medium text-gray-800">
                  {{ formatSpeed(connection.downloadSpeed) }}
                </p>
                <p class="mt-1 text-xs text-gray-500">
                  {{ formatBytes(connection.download) }}
                </p>
              </div>

              <div>
                <p class="text-sm font-medium text-gray-800">
                  {{ formatSpeed(connection.uploadSpeed) }}
                </p>
                <p class="mt-1 text-xs text-gray-500">
                  {{ formatBytes(connection.upload) }}
                </p>
              </div>

              <div class="min-w-0">
                <p class="truncate text-sm text-gray-800">
                  {{ connections.getConnectionChain(connection) }}
                </p>
                <p class="mt-1 truncate text-xs text-gray-500">
                  {{ connection.rule || "--" }}
                </p>
              </div>

              <div class="min-w-0">
                <p class="truncate text-sm text-gray-800">
                  {{ connection.metadata.sourceIP }}:{{ connection.metadata.sourcePort }}
                </p>
                <p class="mt-1 truncate text-xs text-gray-500">
                  {{ connection.metadata.process || connection.metadata.inboundName || "--" }}
                </p>
              </div>

              <div>
                <p class="text-sm text-gray-800">
                  {{ connections.formatRelativeDuration(connection.start) }}
                </p>
              </div>

              <div class="flex items-start justify-end">
                <button
                  v-if="connections.currentTab.value === 'active'"
                  class="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="
                    connections.activeDisconnectIds.value.includes(connection.id)
                  "
                  @click.stop="connections.disconnectConnection(connection.id)"
                >
                  {{
                    connections.activeDisconnectIds.value.includes(connection.id)
                      ? "..."
                      : "Close"
                  }}
                </button>
              </div>
            </button>

            <div
              v-if="connections.visibleConnections.value.length === 0"
              class="flex h-64 items-center justify-center px-6 text-center text-sm text-gray-500"
            >
              No connections matched the current filters.
            </div>
          </div>
        </div>
      </template>
    </div>

    <ConnectionDetailsModal
      :open="connections.detailsOpen.value"
      :connection="connections.selectedConnection.value"
      @close="connections.closeDetails"
      @disconnect="connections.disconnectConnection"
    />
  </div>
</template>
