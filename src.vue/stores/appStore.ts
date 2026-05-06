import { computed, reactive, toRefs } from "vue";
import { loadAppSettings, saveAppSettings } from "../services/api";
import type {
  AppPage,
  AppSettings,
  ConfigFileEntry,
  PageUiSettings,
  SingboxCoreChannel,
  SubscriptionRecord,
} from "../types/app";
import { createDefaultAppSettings } from "../types/app";

const state = reactive({
  initialized: false,
  isRunning: false,
  pendingOperations: 0,
  configFiles: [] as ConfigFileEntry[],
  subscriptions: {} as SubscriptionRecord,
  appSettings: createDefaultAppSettings(),
});

let settingsHydrated = false;

function cloneAppSettings(settings: AppSettings): AppSettings {
  return {
    schema_version: settings.schema_version,
    app: { ...settings.app },
    singbox_core: { ...settings.singbox_core },
    pages: {
      proxies: {
        collapsed_groups: { ...settings.pages.proxies.collapsed_groups },
      },
      connections: {
        current_tab: settings.pages.connections.current_tab,
        column_order: [...settings.pages.connections.column_order],
        visible_columns: [...settings.pages.connections.visible_columns],
        sort_key: settings.pages.connections.sort_key,
        sort_direction: settings.pages.connections.sort_direction,
        grouped_column: settings.pages.connections.grouped_column,
        collapsed_groups: {
          ...settings.pages.connections.collapsed_groups,
        },
      },
      logs: {
        log_level: settings.pages.logs.log_level,
        type_filter: settings.pages.logs.type_filter,
      },
      rules: {
        current_tab: settings.pages.rules.current_tab,
      },
    },
  };
}

async function persistSettings() {
  if (!settingsHydrated) {
    return;
  }

  await saveAppSettings(state.appSettings);
}

function replaceAppSettings(nextSettings: AppSettings) {
  state.appSettings = cloneAppSettings(nextSettings);
}

async function updateAppSettings(updater: (settings: AppSettings) => void) {
  const nextSettings = cloneAppSettings(state.appSettings);
  updater(nextSettings);
  replaceAppSettings(nextSettings);
  await persistSettings();
}

async function updatePageSettings<K extends keyof PageUiSettings>(
  page: K,
  updater: (settings: PageUiSettings[K]) => void,
) {
  await updateAppSettings((settings) => {
    updater(settings.pages[page]);
  });
}

export function useAppStore() {
  const isLoading = computed(() => state.pendingOperations > 0);
  const currentPage = computed(() => state.appSettings.app.current_page);
  const selectedConfigPath = computed(
    () => state.appSettings.app.selected_config_path,
  );
  const selectedConfigDisplay = computed(
    () => state.appSettings.app.selected_config_display,
  );
  const activeSingboxCoreChannel = computed(
    () => state.appSettings.singbox_core.active_channel,
  );
  const activeSingboxCoreVersion = computed(
    () => state.appSettings.singbox_core.active_version,
  );
  const appSettings = computed(() => state.appSettings);

  async function hydrateSettings() {
    replaceAppSettings(await loadAppSettings());
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
    await updateAppSettings((settings) => {
      settings.app.current_page = page;
    });
  }

  async function setSelectedConfig(
    path: string | null,
    displayName: string | null,
  ) {
    await updateAppSettings((settings) => {
      settings.app.selected_config_path = path;
      settings.app.selected_config_display = displayName;
    });
  }

  async function setActiveSingboxCoreSelection(
    channel: SingboxCoreChannel | null,
    version: string | null,
  ) {
    await updateAppSettings((settings) => {
      settings.singbox_core.active_channel = channel;
      settings.singbox_core.active_version = version;
    });
  }

  async function setSelectedCoreOptionKey(value: string) {
    await updateAppSettings((settings) => {
      settings.singbox_core.selected_option_key = value;
    });
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
    appSettings,
    currentPage,
    selectedConfigPath,
    selectedConfigDisplay,
    activeSingboxCoreChannel,
    activeSingboxCoreVersion,
    isLoading,
    hydrateSettings,
    beginLoading,
    endLoading,
    withLoading,
    updateAppSettings,
    updatePageSettings,
    setCurrentPage,
    setSelectedConfig,
    setActiveSingboxCoreSelection,
    setSelectedCoreOptionKey,
    setConfigFiles,
    setSubscriptions,
    setRunning,
    markInitialized,
  };
}
