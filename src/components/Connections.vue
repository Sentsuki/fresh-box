<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ConnectionDetailsModal from "./connections/ConnectionDetailsModal.vue";
import ConnectionTableCell from "./connections/ConnectionTableCell.vue";
import { useConnectionsStream } from "../composables/useConnectionsStream";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const connections = useConnectionsStream();
const columnsMenuOpen = ref(false);

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
                ? 'border border-emerald-200 bg-emerald-100 text-emerald-700'
                : statusLabel === 'Connecting'
                  ? 'border border-amber-200 bg-amber-100 text-amber-700'
                  : statusLabel === 'Error'
                    ? 'border border-rose-200 bg-rose-100 text-rose-700'
                    : 'border border-slate-200 bg-slate-100 text-slate-600'
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
        class="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500"
      >
        Start sing-box first, then open Connections to inspect live traffic.
      </div>

      <template v-else>
        <div class="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-1 flex-wrap items-center gap-2">
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
                  <span class="ml-1 text-xs text-gray-400">
                    {{ connections.activeCount.value }}
                  </span>
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
                  <span class="ml-1 text-xs text-gray-400">
                    {{ connections.closedCount.value }}
                  </span>
                </button>
              </div>

              <input
                v-model="connections.search.value"
                type="text"
                class="min-w-56 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition-all hover:bg-gray-100 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
                placeholder="Search host / IP / rule / chain / process"
              />

              <div class="relative">
                <button
                  class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  @click="columnsMenuOpen = !columnsMenuOpen"
                >
                  Columns
                </button>

                <div
                  v-if="columnsMenuOpen"
                  class="absolute left-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <div>
                      <p class="text-sm font-semibold text-gray-800">Custom table columns</p>
                      <p class="text-xs text-gray-500">
                        Toggle visibility and reorder columns.
                      </p>
                    </div>
                    <button
                      class="text-xs font-medium text-blue-600 hover:text-blue-700"
                      @click="connections.resetColumnCustomization()"
                    >
                      Reset
                    </button>
                  </div>

                  <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
                    <div
                      v-for="(column, index) in connections.orderedColumnOptions.value"
                      :key="column.key"
                      class="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-2"
                    >
                      <input
                        :checked="connections.isColumnVisible(column.key)"
                        type="checkbox"
                        class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        @change="connections.toggleColumnVisibility(column.key)"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-gray-700">
                          {{ column.label }}
                        </p>
                      </div>
                      <div class="flex items-center gap-1">
                        <button
                          class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                          :disabled="index === 0"
                          @click="connections.moveColumn(column.key, -1)"
                        >
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 5l-7 7m0 0l7 7m-7-7h14"
                            />
                          </svg>
                        </button>
                        <button
                          class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                          :disabled="index === connections.orderedColumnOptions.value.length - 1"
                          @click="connections.moveColumn(column.key, 1)"
                        >
                          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 19l7-7m0 0l-7-7m7 7H5"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="connections.groupedColumn.value"
                class="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
              >
                <span>Grouped by {{ connections.groupedColumn.value.label }}</span>
                <button
                  class="font-medium text-blue-600 hover:text-blue-800"
                  @click="connections.clearGrouping()"
                >
                  Clear
                </button>
              </div>
            </div>

            <div class="flex items-center gap-1 pr-1">
              <button
                class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                :title="connections.isPaused.value ? 'Resume' : 'Pause'"
                @click="connections.isPaused.value = !connections.isPaused.value"
              >
                <svg
                  v-if="connections.isPaused.value"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <svg
                  v-else
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>

              <button
                v-if="connections.currentTab.value === 'active'"
                class="rounded-lg p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canCloseVisible || connections.isDisconnectingAll.value"
                title="Close Visible Connections"
                @click="connections.disconnectVisibleConnections"
              >
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              </button>

              <button
                v-if="connections.currentTab.value === 'closed'"
                class="rounded-lg p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                title="Clear Closed Connections"
                @click="connections.clearClosedConnections"
              >
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="connections.streamError.value"
          class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ connections.streamError.value }}
        </div>

        <div class="min-h-0 grow overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table class="min-w-full border-separate border-spacing-0 text-sm">
            <thead class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th
                  v-for="column in connections.visibleColumns.value"
                  :key="column.key"
                  class="border-b border-gray-200 px-4 py-3 text-left align-middle"
                  :class="column.align === 'end' ? 'text-right' : 'text-left'"
                >
                  <div
                    class="flex items-center gap-1"
                    :class="column.align === 'end' ? 'justify-end' : 'justify-start'"
                  >
                    <button
                      class="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
                      @click="connections.toggleSort(column.key)"
                    >
                      <span>{{ column.label }}</span>
                      <svg
                        v-if="connections.sortKey.value === column.key && connections.sortDirection.value === 'asc'"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                      <svg
                        v-else-if="connections.sortKey.value === column.key && connections.sortDirection.value === 'desc'"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    <button
                      v-if="column.groupable"
                      class="rounded p-1 transition-colors"
                      :class="
                        connections.groupedColumnKey.value === column.key
                          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      "
                      :title="
                        connections.groupedColumnKey.value === column.key
                          ? 'Ungroup'
                          : `Group by ${column.label}`
                      "
                      @click.stop="connections.toggleGrouping(column.key)"
                    >
                      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 7h16M4 12h10M4 17h16"
                        />
                      </svg>
                    </button>
                  </div>
                </th>
                <th class="border-b border-gray-200 px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              <tr v-if="connections.visibleConnections.value.length === 0">
                <td
                  :colspan="connections.visibleColumns.value.length + 1"
                  class="px-6 py-16 text-center text-sm text-gray-400"
                >
                  No connections matched the current filters.
                </td>
              </tr>

              <template v-else-if="connections.groupedColumn.value">
                <template
                  v-for="group in connections.groupedVisibleConnections.value"
                  :key="group.id"
                >
                  <tr
                    class="cursor-pointer bg-slate-100/80 transition-colors hover:bg-slate-200/70"
                    @click="connections.toggleGroupCollapsed(group.id)"
                  >
                    <td
                      :colspan="connections.visibleColumns.value.length + 1"
                      class="border-b border-slate-200 px-4 py-2.5"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <svg
                            class="h-4 w-4 shrink-0 text-slate-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              v-if="connections.isGroupCollapsed(group.id)"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 5l7 7-7 7"
                            />
                            <path
                              v-else
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                          <span class="truncate text-sm font-semibold text-slate-700">
                            {{ group.column.label }}: {{ group.label }}
                          </span>
                        </div>
                        <span class="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                          {{ group.items.length }} item{{ group.items.length === 1 ? "" : "s" }}
                        </span>
                      </div>
                    </td>
                  </tr>

                  <tr
                    v-for="connection in group.items"
                    v-show="!connections.isGroupCollapsed(group.id)"
                    :key="connection.id"
                    class="cursor-pointer bg-white transition-colors hover:bg-gray-50"
                    @click="connections.openDetails(connection)"
                  >
                    <td
                      v-for="column in connections.visibleColumns.value"
                      :key="`${connection.id}-${column.key}`"
                      class="border-b border-gray-100 px-4 py-3 align-top"
                      :class="column.align === 'end' ? 'text-right' : 'text-left'"
                    >
                      <ConnectionTableCell
                        :column-key="column.key"
                        :connection="connection"
                      />
                    </td>
                    <td class="border-b border-gray-100 px-4 py-3 text-right align-top">
                      <button
                        v-if="connections.currentTab.value === 'active'"
                        class="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-rose-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="connections.activeDisconnectIds.value.includes(connection.id)"
                        title="Close Connection"
                        @click.stop="connections.disconnectConnection(connection.id)"
                      >
                        <svg
                          v-if="connections.activeDisconnectIds.value.includes(connection.id)"
                          class="h-4 w-4 animate-spin text-rose-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <svg
                          v-else
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </template>
              </template>

              <template v-else>
                <tr
                  v-for="connection in connections.visibleConnections.value"
                  :key="connection.id"
                  class="cursor-pointer bg-white transition-colors hover:bg-gray-50"
                  @click="connections.openDetails(connection)"
                >
                  <td
                    v-for="column in connections.visibleColumns.value"
                    :key="`${connection.id}-${column.key}`"
                    class="border-b border-gray-100 px-4 py-3 align-top"
                    :class="column.align === 'end' ? 'text-right' : 'text-left'"
                  >
                    <ConnectionTableCell
                      :column-key="column.key"
                      :connection="connection"
                    />
                  </td>
                  <td class="border-b border-gray-100 px-4 py-3 text-right align-top">
                    <button
                      v-if="connections.currentTab.value === 'active'"
                      class="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-rose-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="connections.activeDisconnectIds.value.includes(connection.id)"
                      title="Close Connection"
                      @click.stop="connections.disconnectConnection(connection.id)"
                    >
                      <svg
                        v-if="connections.activeDisconnectIds.value.includes(connection.id)"
                        class="h-4 w-4 animate-spin text-rose-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <svg
                        v-else
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
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
