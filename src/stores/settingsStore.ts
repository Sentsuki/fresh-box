import { produce } from "immer";
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
  setSelectedProfile: (id: string | null) => Promise<void>;
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
  setAutoCloseConnections: (enabled: boolean) => Promise<void>;
  setExitReminderMinutes: (minutes: number) => Promise<void>;
  setCheckUpdateEnabled: (enabled: boolean) => Promise<void>;
  setUpdateCheckPrompted: () => Promise<void>;
  setLastShownUpdateVersion: (version: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set, get) => ({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},

    hydrate: async () => {
      const settings = await loadAppSettings();
      set({ settings: normalizeAppSettings(settings), hydrated: true });
    },

    updateSettings: async (updater) => {
      // 结构共享：没改到的分支保持原引用。以前是整份 JSON 深拷贝，改一个
      // 开关所有字段的引用都变了，订阅了其他字段的组件也跟着收到「变化」
      // （连接表的列宽就为此专门做过逐值比较）。规范化只在 hydrate 时做一次
      // —— 之后的每次修改都是类型约束下的，不会引入不合规的值。
      const next = produce(get().settings, updater);
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

    setSelectedProfile: async (id) => {
      await get().updateSettings((s) => {
        s.profiles.selected_profile_id = id;
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

    setAutoCloseConnections: async (enabled) => {
      await get().updateSettings((s) => {
        s.settings.auto_close_connections = enabled;
      });
    },

    setExitReminderMinutes: async (minutes) => {
      await get().updateSettings((s) => {
        s.settings.exit_reminder_minutes = minutes;
      });
    },

    setCheckUpdateEnabled: async (enabled) => {
      await get().updateSettings((s) => {
        s.updates.check_update_enabled = enabled;
      });
    },

    setUpdateCheckPrompted: async () => {
      await get().updateSettings((s) => {
        s.updates.update_check_prompted = true;
      });
    },

    setLastShownUpdateVersion: async (version) => {
      await get().updateSettings((s) => {
        s.updates.last_shown_update_version = version;
      });
    },
  }),
);
