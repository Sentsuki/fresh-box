import { create } from "zustand";
import { loadAppSettings, saveAppSettings } from "../services/api";
import type {
  AppPage,
  AppSettings,
  ConnectionColumnKey,
  ConnectionPageTab,
  SortDirection,
  ThemeMode,
} from "../types/app";
import { createDefaultAppSettings, normalizeAppSettings } from "../types/app";

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  connectionExpandedGroups: Record<string, boolean>;
}

interface SettingsActions {
  hydrate: () => Promise<void>;
  updateSettings: (updater: (s: AppSettings) => void) => Promise<void>;
  setCurrentPage: (page: AppPage) => Promise<void>;
  setSelectedConfig: (
    path: string | null,
    displayName: string | null,
  ) => Promise<void>;
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
  setConnectionsColumnSizes: (sizes: Record<string, number>) => Promise<void>;
  setConnectionExpandedGroups: (groups: Record<string, boolean>) => void;
  setLogTypeFilter: (filter: string) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setCloseBehavior: (behavior: "hide" | "destroy") => Promise<void>;
  setAutoCloseConnections: (enabled: boolean) => Promise<void>;
}

function cloneSettings(s: AppSettings): AppSettings {
  return normalizeAppSettings(JSON.parse(JSON.stringify(s)) as AppSettings);
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set, get) => ({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},

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
        s.profiles.selected_config_path = path;
        s.profiles.selected_config_display = displayName;
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
      });
    },

    setConnectionsColumnSizes: async (sizes) => {
      await get().updateSettings((s) => {
        s.connections.column_sizes = sizes;
      });
    },

    setConnectionExpandedGroups: (groups) => {
      set({ connectionExpandedGroups: groups });
    },

    setLogTypeFilter: async (filter) => {
      await get().updateSettings((s) => {
        s.logs.type_filter = filter;
      });
    },

    setThemeMode: async (mode) => {
      await get().updateSettings((s) => {
        s.settings.theme_mode = mode;
      });
    },

    setCloseBehavior: async (behavior) => {
      await get().updateSettings((s) => {
        s.settings.close_behavior = behavior;
      });
    },

    setAutoCloseConnections: async (enabled) => {
      await get().updateSettings((s) => {
        s.settings.auto_close_connections = enabled;
      });
    },
  }),
);
