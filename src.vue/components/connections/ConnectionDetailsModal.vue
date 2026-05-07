<script setup lang="ts">
import { computed } from "vue";
import { formatBytes, formatRelativeDuration, formatSpeed } from "../../services/utils";
import type { ConnectionEntry } from "../../types/app";

const props = defineProps<{
  connection: ConnectionEntry | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  disconnect: [id: string];
}>();

const formattedJson = computed(() =>
  props.connection ? JSON.stringify(props.connection, null, 2) : "",
);
</script>

<template>
  <div
    v-if="open && connection"
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6"
    @click.self="emit('close')"
  >
    <div
      class="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">Connection Details</h3>
          <p class="mt-1 text-sm text-gray-500">
            {{ connection.metadata.host || connection.metadata.destinationIP }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-rose-700"
            @click="emit('disconnect', connection.id)"
          >
            Disconnect
          </button>
          <button
            class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-300"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <div class="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[320px,minmax(0,1fr)]">
        <div class="space-y-3">
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h4 class="mb-3 text-sm font-semibold text-gray-700">Summary</h4>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Host</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ connection.metadata.host || "--" }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Destination</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ connection.metadata.destinationIP }}:{{
                    connection.metadata.destinationPort
                  }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Source</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ connection.metadata.sourceIP }}:{{ connection.metadata.sourcePort }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Inbound</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ connection.metadata.inboundName || "--" }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Network</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ connection.metadata.network }}/{{ connection.metadata.type }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Duration</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ formatRelativeDuration(connection.start) }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Download</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ formatBytes(connection.download) }} / {{ formatSpeed(connection.downloadSpeed) }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Upload</dt>
                <dd class="text-right font-medium text-gray-800">
                  {{ formatBytes(connection.upload) }} / {{ formatSpeed(connection.uploadSpeed) }}
                </dd>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h4 class="mb-3 text-sm font-semibold text-gray-700">Route</h4>
            <p class="text-sm text-gray-700">
              {{ connection.chains.length > 0 ? connection.chains.join(" -> ") : "--" }}
            </p>
            <p class="mt-3 text-xs text-gray-500">Rule</p>
            <p class="text-sm text-gray-700">{{ connection.rule || "--" }}</p>
            <p v-if="connection.rulePayload" class="mt-2 text-xs text-gray-500">
              {{ connection.rulePayload }}
            </p>
          </div>
        </div>

        <div class="min-w-0 rounded-xl border border-gray-200 bg-slate-950 p-4">
          <pre class="overflow-x-auto text-xs leading-6 text-slate-100">{{
            formattedJson
          }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
