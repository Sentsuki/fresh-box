import { create } from "zustand";
import { loadAppSettings, saveAppSettings } from "../services/api";
import type {
  AppPage,
  AppSettings,
  ConnectionColumnKey,
  ConnectionPageTab,
  LogLevel,
  RulesTab,
  SingboxCoreChannel,
  SortDirection,
} from "../types/app";
import { createDefaultAppSettings, normalizeAppSettings } from "../types/app";

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
}

interface SettingsActions {
  hydrate: () => Promise<void>;
  updateSettings: (updater: (s: AppSettings) => void) => Promise<void>;
  setCurrentPage: (page: AppPage) => Promise<void>;
  setSelectedConfig: (
    path: string | null,
    displayName: string | null,
  ) => Promise<void>;
  setActiveSingboxCoreSelection: (
    channel: SingboxCoreChannel | null,
    version: string | null,
  ) => Promise<void>;
  setSelectedCoreOptionKey: (value: string) => Promise<void>;
  setProxyGroupCollapsed: (
    group: string,
    collapsed: boolean,
  ) => Promise<void>;
  setConnectionsTab: (tab: ConnectionPageTab) => Promise<void>;
  setConnectionsColumnOrder: (order: ConnectionColumnKey[]) => Promise<void>;
  setConnectionsVisibleColumns: (
    columns: ConnectionColumnKey[],
  ) => Promise<void>;
  setConnectionsSortKey: (key: ConnectionColumnKey) => Promise<void>;
  setConnectionsSortDirection: (direction: SortDirection) => Promise<void>;
  setConnectionsGroupedColumn: (
    column: ConnectionColumnKey | null,
  ) => Promise<void>;
  setConnectionGroupCollapsed: (
    group: string,
    collapsed: boolean,
  ) => Promise<void>;
  setLogLevel: (level: LogLevel) => Promise<void>;
  setLogTypeFilter: (filter: string) => Promise<void>;
  setRulesTab: (tab: RulesTab) => Promise<void>;
}

function cloneSettings(s: AppSettings): AppSettings {
  return normalizeAppSettings(JSON.parse(JSON.stringify(s)) as AppSettings);
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set, get) => ({
    settings: createDefaultAppSettings(),
    hydrated: false,

    hydrate: async () => {
      const settings = await loadAppSettings();
      set({ settings: cloneSettings(settings), hydrated: true });
    },

    updateSettings: async (updater) => {
      const next = cloneSettings(get().settings);
      updater(next);
      set({ settings: next });
      if (get().hydrated) {
        await saveAppSettings(next);
      }
    },

    setCurrentPage: async (page) => {
      await get().updateSettings((s) => {
        s.app.current_page = page;
      });
    },

    setSelectedConfig: async (path, displayName) => {
      await get().updateSettings((s) => {
        s.app.selected_config_path = path;
        s.app.selected_config_display = displayName;
      });
    },

    setActiveSingboxCoreSelection: async (channel, version) => {
      await get().updateSettings((s) => {
        s.singbox_core.active_channel = channel;
        s.singbox_core.active_version = version;
      });
    },

    setSelectedCoreOptionKey: async (value) => {
      await get().updateSettings((s) => {
        s.singbox_core.selected_option_key = value;
      });
    },

    setProxyGroupCollapsed: async (group, collapsed) => {
      await get().updateSettings((s) => {
        s.pages.proxies.collapsed_groups[group] = collapsed;
      });
    },

    setConnectionsTab: async (tab) => {
      await get().updateSettings((s) => {
        s.pages.connections.current_tab = tab;
      });
    },

    setConnectionsColumnOrder: async (order) => {
      await get().updateSettings((s) => {
        s.pages.connections.column_order = order;
      });
    },

    setConnectionsVisibleColumns: async (columns) => {
      await get().updateSettings((s) => {
        s.pages.connections.visible_columns = columns;
      });
    },

    setConnectionsSortKey: async (key) => {
      await get().updateSettings((s) => {
        s.pages.connections.sort_key = key;
      });
    },

    setConnectionsSortDirection: async (direction) => {
      await get().updateSettings((s) => {
        s.pages.connections.sort_direction = direction;
      });
    },

    setConnectionsGroupedColumn: async (column) => {
      await get().updateSettings((s) => {
        s.pages.connections.grouped_column = column;
      });
    },

    setConnectionGroupCollapsed: async (group, collapsed) => {
      await get().updateSettings((s) => {
        s.pages.connections.collapsed_groups[group] = collapsed;
      });
    },

    setLogLevel: async (level) => {
      await get().updateSettings((s) => {
        s.pages.logs.log_level = level;
      });
    },

    setLogTypeFilter: async (filter) => {
      await get().updateSettings((s) => {
        s.pages.logs.type_filter = filter;
      });
    },

    setRulesTab: async (tab) => {
      await get().updateSettings((s) => {
        s.pages.rules.current_tab = tab;
      });
    },
  }),
);
