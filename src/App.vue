<script setup lang="ts">
import { onMounted } from "vue";
import Sidebar from "./components/Sidebar.vue";
import Overview from "./components/Overview.vue";
import Proxy from "./components/Proxy.vue";
import Config from "./components/Config.vue";
import Custom from "./components/Custom.vue";
import Settings from "./components/Settings.vue";
import Toast from "./components/Toast.vue";
import { useConfigs } from "./composables/useConfigs";
import { useSingbox } from "./composables/useSingbox";
import { useAppStore } from "./stores/appStore";
import { toast } from "./composables/useToast";

const appStore = useAppStore();
const configs = useConfigs();
const singbox = useSingbox();

onMounted(async () => {
  try {
    await configs.initializeConfigs();
    await singbox.initializeSingbox();
    appStore.markInitialized();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Failed to initialize app",
    );
  }
});
</script>

<template>
  <div class="app-container">
    <Sidebar />

    <div class="main-content">
      <Overview v-if="appStore.currentPage.value === 'overview'" />
      <Proxy v-else-if="appStore.currentPage.value === 'proxy'" />
      <Config v-else-if="appStore.currentPage.value === 'config'" />
      <Custom v-else-if="appStore.currentPage.value === 'custom'" />
      <Settings v-else />
    </div>

    <Toast />
  </div>
</template>
