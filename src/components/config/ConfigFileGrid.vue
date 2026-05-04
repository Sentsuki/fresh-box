<script setup lang="ts">
import { computed } from "vue";
import ConfigFileCard from "./ConfigFileCard.vue";
import { useAppStore } from "../../stores/appStore";

const appStore = useAppStore();
const hasConfigFiles = computed(() => appStore.configFiles.value.length > 0);
</script>

<template>
  <div class="mt-6 min-h-0 grow overflow-y-auto">
    <div
      v-if="!hasConfigFiles"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <div class="mb-4 text-6xl opacity-50">📄</div>
      <h3 class="mb-2 text-xl font-semibold text-gray-700">
        No Configuration Files
      </h3>
      <p class="max-w-md text-gray-500">
        Add a configuration file by subscribing to a URL or selecting a local
        file
      </p>
    </div>

    <div
      v-else
      class="grid gap-4"
      style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))"
    >
      <ConfigFileCard
        v-for="config in appStore.configFiles.value"
        :key="config.path"
        :config="config"
        :is-selected="config.path === appStore.selectedConfigPath.value"
        :subscription="appStore.subscriptions.value[config.displayName]"
        :is-loading="appStore.isLoading.value"
      />
    </div>
  </div>
</template>
