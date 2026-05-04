import { computed, reactive, toRefs } from "vue";
import { loadAppSettings, saveAppSettings } from "../services/api";
import type {
  AppPage,
  AppSettings,
  ConfigFileEntry,
  SubscriptionRecord,
} from "../types/app";

const state = reactive({
  initialized: false,
  isRunning: false,
  pendingOperations: 0,
  currentPage: "overview" as AppPage,
  configFiles: [] as ConfigFileEntry[],
  selectedConfigPath: null as string | null,
  selectedConfigDisplay: null as string | null,
  subscriptions: {} as SubscriptionRecord,
});

let settingsHydrated = false;

async function persistSettings() {
  if (!settingsHydrated) {
    return;
  }

  const payload: AppSettings = {
    selected_config: state.selectedConfigPath,
    selected_config_display: state.selectedConfigDisplay,
    current_page: state.currentPage,
  };

  await saveAppSettings(payload);
}

export function useAppStore() {
  const isLoading = computed(() => state.pendingOperations > 0);

  async function hydrateSettings() {
    const settings = await loadAppSettings();
    state.currentPage =
      settings.current_page === "overview" ||
      settings.current_page === "config" ||
      settings.current_page === "custom" ||
      settings.current_page === "settings"
        ? settings.current_page
        : "overview";
    state.selectedConfigPath = settings.selected_config;
    state.selectedConfigDisplay = settings.selected_config_display;
    settingsHydrated = true;
  }

  function beginLoading() {
    state.pendingOperations += 1;
  }

  function endLoading() {
    state.pendingOperations = Math.max(0, state.pendingOperations - 1);
  }

  async function withLoading<T>(operation: () => Promise<T>): Promise<T> {
    beginLoading();

    try {
      return await operation();
    } finally {
      endLoading();
    }
  }

  async function setCurrentPage(page: AppPage) {
    state.currentPage = page;
    await persistSettings();
  }

  async function setSelectedConfig(
    path: string | null,
    displayName: string | null,
  ) {
    state.selectedConfigPath = path;
    state.selectedConfigDisplay = displayName;
    await persistSettings();
  }

  function setConfigFiles(configFiles: ConfigFileEntry[]) {
    state.configFiles = configFiles;
  }

  function setSubscriptions(subscriptions: SubscriptionRecord) {
    state.subscriptions = subscriptions;
  }

  function setRunning(isRunning: boolean) {
    state.isRunning = isRunning;
  }

  function markInitialized() {
    state.initialized = true;
  }

  return {
    ...toRefs(state),
    isLoading,
    hydrateSettings,
    beginLoading,
    endLoading,
    withLoading,
    setCurrentPage,
    setSelectedConfig,
    setConfigFiles,
    setSubscriptions,
    setRunning,
    markInitialized,
  };
}
