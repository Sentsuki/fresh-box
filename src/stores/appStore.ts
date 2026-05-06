import { create } from 'zustand';
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

interface AppState {
  initialized: boolean;
  isRunning: boolean;
  pendingOperations: number;
  configFiles: ConfigFileEntry[];
  subscriptions: SubscriptionRecord;
  appSettings: AppSettings;
  settingsHydrated: boolean;
}

interface AppActions {
  hydrateSettings: () => Promise<void>;
  beginLoading: () => void;
  endLoading: () => void;
  withLoading: <T>(operation: () => Promise<T>) => Promise<T>;
  updateAppSettings: (updater: (settings: AppSettings) => void) => Promise<void>;
  updatePageSettings: <K extends keyof PageUiSettings>(page: K, updater: (settings: PageUiSettings[K]) => void) => Promise<void>;
  setCurrentPage: (page: AppPage) => Promise<void>;
  setSelectedConfig: (path: string | null, displayName: string | null) => Promise<void>;
  setActiveSingboxCoreSelection: (channel: SingboxCoreChannel | null, version: string | null) => Promise<void>;
  setSelectedCoreOptionKey: (value: string) => Promise<void>;
  setConfigFiles: (configFiles: ConfigFileEntry[]) => void;
  setSubscriptions: (subscriptions: SubscriptionRecord) => void;
  setRunning: (isRunning: boolean) => void;
  markInitialized: () => void;
}

type AppStore = AppState & AppActions;

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

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  isRunning: false,
  pendingOperations: 0,
  configFiles: [],
  subscriptions: {},
  appSettings: createDefaultAppSettings(),
  settingsHydrated: false,

  hydrateSettings: async () => {
    const settings = await loadAppSettings();
    set({ appSettings: cloneAppSettings(settings), settingsHydrated: true });
  },

  beginLoading: () => set((state) => ({ pendingOperations: state.pendingOperations + 1 })),
  
  endLoading: () => set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) })),

  withLoading: async <T>(operation: () => Promise<T>): Promise<T> => {
    get().beginLoading();
    try {
      return await operation();
    } finally {
      get().endLoading();
    }
  },

  updateAppSettings: async (updater: (settings: AppSettings) => void) => {
    const nextSettings = cloneAppSettings(get().appSettings);
    updater(nextSettings);
    set({ appSettings: nextSettings });
    
    if (get().settingsHydrated) {
      await saveAppSettings(nextSettings);
    }
  },

  updatePageSettings: async <K extends keyof PageUiSettings>(
    page: K,
    updater: (settings: PageUiSettings[K]) => void
  ) => {
    await get().updateAppSettings((settings) => {
      updater(settings.pages[page]);
    });
  },

  setCurrentPage: async (page: AppPage) => {
    await get().updateAppSettings((settings) => {
      settings.app.current_page = page;
    });
  },

  setSelectedConfig: async (path: string | null, displayName: string | null) => {
    await get().updateAppSettings((settings) => {
      settings.app.selected_config_path = path;
      settings.app.selected_config_display = displayName;
    });
  },

  setActiveSingboxCoreSelection: async (channel: SingboxCoreChannel | null, version: string | null) => {
    await get().updateAppSettings((settings) => {
      settings.singbox_core.active_channel = channel;
      settings.singbox_core.active_version = version;
    });
  },

  setSelectedCoreOptionKey: async (value: string) => {
    await get().updateAppSettings((settings) => {
      settings.singbox_core.selected_option_key = value;
    });
  },

  setConfigFiles: (configFiles: ConfigFileEntry[]) => set({ configFiles }),
  
  setSubscriptions: (subscriptions: SubscriptionRecord) => set({ subscriptions }),
  
  setRunning: (isRunning: boolean) => set({ isRunning }),
  
  markInitialized: () => set({ initialized: true }),
}));
