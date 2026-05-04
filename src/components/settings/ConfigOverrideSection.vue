<script setup lang="ts">
const isOverrideEnabled = defineModel<boolean>("enabled", { required: true });
const overrideConfig = defineModel<string>("config", { required: true });

defineProps<{
  isValidJson: boolean;
  jsonError: string;
}>();

defineEmits<{
  save: [];
  clear: [];
}>();
</script>

<template>
  <div class="settings-section">
    <h3>Config Override</h3>

    <div class="setting-item border-b-0!">
      <span class="text-base font-medium text-gray-700">Enable Override</span>
      <label class="relative cursor-pointer">
        <input v-model="isOverrideEnabled" type="checkbox" class="sr-only" />
        <div
          class="h-6 w-11 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
          :class="isOverrideEnabled ? 'bg-blue-500' : 'bg-gray-200'"
        />
        <div
          class="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
          :class="isOverrideEnabled ? 'translate-x-5' : 'translate-x-0'"
        />
      </label>
    </div>

    <div v-if="isOverrideEnabled" class="mt-4">
      <div class="mb-4">
        <textarea
          v-model="overrideConfig"
          placeholder="Enter your configuration override here (JSON format)"
          rows="12"
          class="w-full resize-y rounded-lg border border-gray-300 bg-white p-4 text-sm leading-relaxed text-gray-800 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          :class="!isValidJson ? 'border-red-400 bg-red-50' : ''"
          style="
            font-family:
              &quot;Consolas&quot;, &quot;Monaco&quot;, &quot;Courier New&quot;,
              monospace;
            min-height: 280px;
          "
        />
        <div
          v-if="!isValidJson"
          class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <strong>JSON Error:</strong> {{ jsonError }}
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button
          :disabled="!isValidJson"
          class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="$emit('save')"
        >
          Save Override
        </button>
        <button
          class="rounded-lg bg-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-300"
          @click="$emit('clear')"
        >
          Clear Override
        </button>
      </div>
    </div>
  </div>
</template>
