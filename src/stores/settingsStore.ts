import { create } from "zustand";
import { loadAppSettings, saveAppSettings } from "../services/api";
import type {
  AdvancedPageTab,
  AppPage,
  AppSettings,
  ConnectionColumnKey,
  ConnectionPageTab,
  LogLevel,
  RulesTab,
  SortDirection,
  ThemeMode,
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
  setSelectedCoreOptionKey: (value: string) => Promise<void>;
  setProxyGroupCollapsed: (group: string, collapsed: boolean) => Promise<void>;
  setConnectionsTab: (tab: ConnectionPageTab) => Promise<void>;
  setConnectionsVisibleColumns: (
    columns: ConnectionColumnKey[],
  ) => Promise<void>;
  setConnectionsPinnedColumns: (
    columns: ConnectionColumnKey[],
  ) => Promise<void>;
  setConnectionsSortKey: (key: ConnectionColumnKey) => Promise<void>;
  setConnectionsSortDirection: (direction: SortDirection) => Promise<void>;
  setConnectionsGroupedColumn: (
    column: ConnectionColumnKey | null,
  ) => Promise<void>;
  setConnectionGroupExpanded: (
    group: string,
    expanded: boolean,
  ) => Promise<void>;
  setConnectionsColumnSizes: (sizes: Record<string, number>) => Promise<void>;
  setLogLevel: (level: LogLevel) => Promise<void>;
  setLogTypeFilter: (filter: string) => Promise<void>;
  setRulesTab: (tab: RulesTab) => Promise<void>;
  setAdvancedTab: (tab: AdvancedPageTab) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setTestUrl: (url: string) => Promise<void>;
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
        s.Profiles.selected_config_path = path;
        s.Profiles.selected_config_display = displayName;
      });
    },

    setSelectedCoreOptionKey: async (value) => {
      await get().updateSettings((s) => {
        s.Settings.singbox_core.selected_option_key = value;
      });
    },

    setProxyGroupCollapsed: async (group, collapsed) => {
      await get().updateSettings((s) => {
        s.proxies.collapsed_groups[group] = collapsed;
      });
    },

    setConnectionsTab: async (tab) => {
      await get().updateSettings((s) => {
        s.connections.current_tab = tab;
      });
    },

    setConnectionsVisibleColumns: async (columns) => {
      await get().updateSettings((s) => {
        s.connections.visible_columns = columns;
      });
    },

    setConnectionsPinnedColumns: async (columns) => {
      await get().updateSettings((s) => {
        s.connections.pinned_columns = columns;
      });
    },

    setConnectionsSortKey: async (key) => {
      await get().updateSettings((s) => {
        s.connections.sort_key = key;
      });
    },

    setConnectionsSortDirection: async (direction) => {
      await get().updateSettings((s) => {
        s.connections.sort_direction = direction;
      });
    },

    setConnectionsGroupedColumn: async (column) => {
      await get().updateSettings((s) => {
        s.connections.grouped_column = column;
        s.connections.expanded_groups = {};
      });
    },

    setConnectionGroupExpanded: async (group, expanded) => {
      await get().updateSettings((s) => {
        s.connections.expanded_groups[group] = expanded;
      });
    },

    setConnectionsColumnSizes: async (sizes) => {
      await get().updateSettings((s) => {
        s.connections.column_sizes = sizes;
      });
    },

    setLogLevel: async (level) => {
      await get().updateSettings((s) => {
        s.logs.log_level = level;
      });
    },

    setLogTypeFilter: async (filter) => {
      await get().updateSettings((s) => {
        s.logs.type_filter = filter;
      });
    },

    setRulesTab: async (tab) => {
      await get().updateSettings((s) => {
        s.rules.current_tab = tab;
      });
    },

    setAdvancedTab: async (tab) => {
      await get().updateSettings((s) => {
        s.advanced.current_tab = tab;
      });
    },

    setThemeMode: async (mode) => {
      await get().updateSettings((s) => {
        s.Settings.theme_mode = mode;
      });
    },

    setTestUrl: async (url) => {
      await get().updateSettings((s) => {
        s.Settings.test_url = url;
      });
    },
  }),
);
