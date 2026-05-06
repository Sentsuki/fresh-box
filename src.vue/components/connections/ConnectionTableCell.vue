<script setup lang="ts">
import {
  formatBytes,
  formatRelativeDuration,
  formatSpeed,
} from "../../services/utils";
import {
  getConnectionChain,
  getConnectionHost,
  getConnectionRule,
} from "../../composables/useConnectionsStream";
import type { ConnectionColumnKey } from "../../types/app";
import type { ConnectionEntry } from "../../types/app";

defineProps<{
  connection: ConnectionEntry;
  columnKey: ConnectionColumnKey;
}>();

function formatConnectionStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
</script>

<template>
  <div v-if="columnKey === 'host'" class="min-w-0">
    <p class="truncate font-semibold text-gray-800" :title="getConnectionHost(connection)">
      {{ getConnectionHost(connection) }}
    </p>
    <p
      class="mt-0.5 truncate text-xs text-gray-500"
      :title="`${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`"
    >
      {{ connection.metadata.destinationIP }}:{{ connection.metadata.destinationPort }}
    </p>
  </div>

  <div
    v-else-if="columnKey === 'destination'"
    class="min-w-0"
  >
    <p
      class="truncate font-medium text-gray-800"
      :title="`${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`"
    >
      {{ connection.metadata.destinationIP }}:{{ connection.metadata.destinationPort }}
    </p>
    <p
      class="mt-0.5 truncate text-xs text-gray-500"
      :title="connection.metadata.host || connection.metadata.sniffHost || '--'"
    >
      {{ connection.metadata.host || connection.metadata.sniffHost || "--" }}
    </p>
  </div>

  <div
    v-else-if="columnKey === 'downloadSpeed'"
    class="text-right"
  >
    <p class="font-medium text-emerald-600">{{ formatSpeed(connection.downloadSpeed) }}</p>
    <p class="mt-0.5 text-xs text-gray-500">{{ formatBytes(connection.download) }}</p>
  </div>

  <div
    v-else-if="columnKey === 'uploadSpeed'"
    class="text-right"
  >
    <p class="font-medium text-blue-600">{{ formatSpeed(connection.uploadSpeed) }}</p>
    <p class="mt-0.5 text-xs text-gray-500">{{ formatBytes(connection.upload) }}</p>
  </div>

  <div
    v-else-if="columnKey === 'download'"
    class="text-right"
  >
    <p class="font-medium text-gray-800">{{ formatBytes(connection.download) }}</p>
    <p class="mt-0.5 text-xs text-gray-500">{{ formatSpeed(connection.downloadSpeed) }}</p>
  </div>

  <div
    v-else-if="columnKey === 'upload'"
    class="text-right"
  >
    <p class="font-medium text-gray-800">{{ formatBytes(connection.upload) }}</p>
    <p class="mt-0.5 text-xs text-gray-500">{{ formatSpeed(connection.uploadSpeed) }}</p>
  </div>

  <div v-else-if="columnKey === 'chain'" class="min-w-0">
    <p class="truncate text-gray-800" :title="getConnectionChain(connection)">
      {{ getConnectionChain(connection) }}
    </p>
    <p class="mt-0.5 truncate text-xs text-gray-500">
      {{ connection.chains.length }} hop{{ connection.chains.length === 1 ? "" : "s" }}
    </p>
  </div>

  <div v-else-if="columnKey === 'rule'" class="min-w-0">
    <p class="truncate text-gray-800" :title="getConnectionRule(connection)">
      {{ getConnectionRule(connection) }}
    </p>
    <p
      class="mt-0.5 truncate text-xs text-gray-500"
      :title="connection.rulePayload || connection.metadata.inboundName || '--'"
    >
      {{ connection.rulePayload || connection.metadata.inboundName || "--" }}
    </p>
  </div>

  <div v-else-if="columnKey === 'source'" class="min-w-0">
    <p
      class="truncate text-gray-800"
      :title="`${connection.metadata.sourceIP}:${connection.metadata.sourcePort}`"
    >
      {{ connection.metadata.sourceIP }}:{{ connection.metadata.sourcePort }}
    </p>
    <p class="mt-0.5 truncate text-xs text-gray-500">
      {{ connection.metadata.inboundName || connection.metadata.inboundUser || "--" }}
    </p>
  </div>

  <div v-else-if="columnKey === 'process'" class="min-w-0">
    <p
      class="truncate text-gray-800"
      :title="connection.metadata.process || connection.metadata.inboundName || '--'"
    >
      {{ connection.metadata.process || connection.metadata.inboundName || "--" }}
    </p>
    <p
      class="mt-0.5 truncate text-xs text-gray-500"
      :title="connection.metadata.processPath || connection.metadata.inboundUser || '--'"
    >
      {{ connection.metadata.processPath || connection.metadata.inboundUser || "--" }}
    </p>
  </div>

  <div v-else-if="columnKey === 'network'" class="min-w-0">
    <p class="truncate text-gray-800">
      {{ connection.metadata.network }}/{{ connection.metadata.type }}
    </p>
    <p class="mt-0.5 truncate text-xs text-gray-500">
      {{ connection.metadata.sniffHost || connection.metadata.host || "--" }}
    </p>
  </div>

  <div v-else-if="columnKey === 'start'" class="text-right">
    <p class="font-medium text-gray-800">
      {{ formatRelativeDuration(connection.start) }}
    </p>
    <p class="mt-0.5 text-xs text-gray-500">
      {{ formatConnectionStart(connection.start) }}
    </p>
  </div>
</template>
