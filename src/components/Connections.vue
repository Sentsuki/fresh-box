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
    <div class="card-header border-b-0 pb-2">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-gray-800">Connections</h2>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
            :class="
              statusLabel === 'Live'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : statusLabel === 'Connecting'
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
        class="rounded-xl border border-dashed border-gray-300 bg-gray-50 flex h-48 items-center justify-center text-sm text-gray-500"
      >
        Start sing-box first, then open Connections to inspect live traffic.
      </div>

      <template v-else>
        <!-- Control Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <!-- Tabs -->
            <div class="inline-flex rounded-lg bg-gray-100 p-1">
              <button
                class="rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
                :class="
                  connections.currentTab.value === 'active'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
                @click="connections.currentTab.value = 'active'"
              >
                Active
              </button>
              <button
                class="rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
                :class="
                  connections.currentTab.value === 'closed'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
                @click="connections.currentTab.value = 'closed'"
              >
                Closed
              </button>
            </div>

            <!-- Sort Select -->
            <div class="flex items-center ml-2 border border-gray-200 bg-gray-50 rounded-lg overflow-hidden">
               <select
                 v-model="connections.sortKey.value"
                 class="bg-transparent px-3 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-100 transition-colors cursor-pointer min-w-24 border-r border-gray-200"
               >
                 <option value="downloadSpeed">Sort: DL Speed</option>
                 <option value="uploadSpeed">Sort: UL Speed</option>
                 <option value="download">Sort: DL Total</option>
                 <option value="upload">Sort: UL Total</option>
                 <option value="host">Sort: Host</option>
                 <option value="start">Sort: Start Time</option>
               </select>
               <button
                 class="px-2 py-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                 @click="connections.sortDirection.value = connections.sortDirection.value === 'asc' ? 'desc' : 'asc'"
                 title="Toggle Sort Direction"
               >
                  <svg v-if="connections.sortDirection.value === 'asc'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                  <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
               </button>
            </div>

            <!-- Search Input -->
            <input
              v-model="connections.search.value"
              type="text"
              class="min-w-48 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition-all hover:bg-gray-100 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search host / IP / rule / chain / process"
            />
          </div>

          <div class="flex items-center gap-1 pr-1">
             <button
              class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              @click="connections.isPaused.value = !connections.isPaused.value"
              :title="connections.isPaused.value ? 'Resume' : 'Pause'"
            >
              <svg v-if="connections.isPaused.value" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            
            <button
              v-if="connections.currentTab.value === 'active'"
              class="rounded-lg p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!canCloseVisible || connections.isDisconnectingAll.value"
              @click="connections.disconnectVisibleConnections"
              title="Close Visible Connections"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </button>

            <button
              v-if="connections.currentTab.value === 'closed'"
              class="rounded-lg p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              @click="connections.clearClosedConnections"
              title="Clear Closed Connections"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>

        <div
          v-if="connections.streamError.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ connections.streamError.value }}
        </div>

        <!-- Table Layout -->
        <div class="min-h-0 grow flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="grid grid-cols-[minmax(180px,2fr)_140px_minmax(140px,1.5fr)_minmax(120px,1fr)_100px_40px] gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 select-none">
            <span>Host / Destination</span>
            <span>Speed / Total</span>
            <span>Chain / Rule</span>
            <span>Source / Process</span>
            <span>Time</span>
            <span class="text-right">...</span>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div
              v-for="connection in connections.visibleConnections.value"
              :key="connection.id"
              class="grid w-full grid-cols-[minmax(180px,2fr)_140px_minmax(140px,1.5fr)_minmax(120px,1fr)_100px_40px] gap-2 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 cursor-pointer"
              @click="connections.openDetails(connection)"
            >
              <div class="min-w-0 flex flex-col justify-center">
                <p class="truncate text-[13px] font-semibold text-gray-800" :title="connections.getConnectionHost(connection)">
                  {{ connections.getConnectionHost(connection) }}
                </p>
                <p class="mt-0.5 text-[11px] text-gray-500 truncate" :title="`${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`">
                  {{ connection.metadata.destinationIP }}:{{ connection.metadata.destinationPort }}
                </p>
              </div>

              <div class="flex flex-col justify-center gap-0.5">
                <div class="flex items-center gap-1.5 text-[12px]">
                   <svg class="h-3 w-3 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                   <span class="font-medium text-gray-700 w-16">{{ formatSpeed(connection.downloadSpeed) }}</span>
                   <span class="text-[10px] text-gray-400 w-12">{{ formatBytes(connection.download) }}</span>
                </div>
                <div class="flex items-center gap-1.5 text-[12px]">
                   <svg class="h-3 w-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                   <span class="font-medium text-gray-700 w-16">{{ formatSpeed(connection.uploadSpeed) }}</span>
                   <span class="text-[10px] text-gray-400 w-12">{{ formatBytes(connection.upload) }}</span>
                </div>
              </div>

              <div class="min-w-0 flex flex-col justify-center">
                <div class="flex flex-wrap items-center gap-1 text-[12px] text-gray-700" :title="connections.getConnectionChain(connection)">
                  <!-- Display only first and last if too many -->
                  <template v-if="connection.chains && connection.chains.length > 2">
                     <span class="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[80px]">{{ connection.chains[0] }}</span>
                     <span class="text-gray-400">→</span>
                     <span class="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[80px]">{{ connection.chains[connection.chains.length - 1] }}</span>
                  </template>
                  <template v-else-if="connection.chains && connection.chains.length > 0">
                     <template v-for="(chain, idx) in connection.chains" :key="idx">
                        <span class="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[80px]">{{ chain }}</span>
                        <span v-if="idx < connection.chains.length - 1" class="text-gray-400">→</span>
                     </template>
                  </template>
                  <span v-else class="text-gray-400">--</span>
                </div>
                <p class="mt-1 truncate text-[11px] text-gray-500">
                  <span class="font-medium bg-blue-50 text-blue-600 px-1 rounded">{{ connection.rule || "--" }}</span>
                </p>
              </div>

              <div class="min-w-0 flex flex-col justify-center">
                <p class="truncate text-[12px] text-gray-700">
                  {{ connection.metadata.sourceIP }}:{{ connection.metadata.sourcePort }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-gray-500">
                  {{ connection.metadata.process || connection.metadata.inboundName || "--" }}
                </p>
              </div>

              <div class="flex flex-col justify-center">
                <p class="text-[12px] text-gray-600 font-medium">
                  {{ connections.formatRelativeDuration(connection.start) }}
                </p>
              </div>

              <div class="flex items-center justify-end">
                <button
                  v-if="connections.currentTab.value === 'active'"
                  class="rounded-full p-1.5 text-gray-400 hover:bg-rose-100 hover:text-rose-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="connections.activeDisconnectIds.value.includes(connection.id)"
                  @click.stop="connections.disconnectConnection(connection.id)"
                  title="Close Connection"
                >
                  <svg v-if="connections.activeDisconnectIds.value.includes(connection.id)" class="h-4 w-4 animate-spin text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div
              v-if="connections.visibleConnections.value.length === 0"
              class="flex h-48 items-center justify-center px-6 text-center text-sm text-gray-400"
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
