import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAppSettings, type AppSettings } from "../types/app";

const loadAppSettings = vi.fn(async () => createDefaultAppSettings());
const saveAppSettings = vi.fn(async (_: AppSettings) => null);
vi.mock("../services/api", () => ({
  loadAppSettings: () => loadAppSettings(),
  saveAppSettings: (settings: AppSettings) => saveAppSettings(settings),
}));

import { useSettingsStore } from "./settingsStore";

/**
 * 设置 store。两条不变量：
 *
 *  1. **hydrate 之前不落盘** —— 否则应用刚起来、还没读到盘上的设置时，任何一次
 *     `setCurrentPage` 都会把默认值写回去，把用户的设置抹掉。
 *  2. **每次都写整份** —— Rust 侧的 `save_app_settings` 是整份覆盖，只改内存里
 *     那一个字段而不重新序列化的话，别的字段会被回退成上一次的值。
 */

beforeEach(() => {
  loadAppSettings.mockClear().mockResolvedValue(createDefaultAppSettings());
  saveAppSettings.mockClear();
  useSettingsStore.setState({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},
  });
});

describe("hydrate", () => {
  it("读到的设置进内存，并标记已就绪", async () => {
    const stored = createDefaultAppSettings();
    stored.app.current_page = "logs";
    loadAppSettings.mockResolvedValueOnce(stored);

    await useSettingsStore.getState().hydrate();

    expect(useSettingsStore.getState().settings.app.current_page).toBe("logs");
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it("读回来的东西也过一遍归一化", async () => {
    // 盘上的值可能是上个版本写的。不归一化的话，一个不认识的页名会让路由
    // 匹配不到任何页面。
    const stored = createDefaultAppSettings();
    (stored.app as { current_page: string }).current_page = "gone";
    loadAppSettings.mockResolvedValueOnce(stored);

    await useSettingsStore.getState().hydrate();

    expect(useSettingsStore.getState().settings.app.current_page).toBe(
      createDefaultAppSettings().app.current_page,
    );
  });
});

describe("updateSettings", () => {
  it("hydrate 之前只改内存，不落盘", async () => {
    await useSettingsStore.getState().setCurrentPage("logs");

    expect(useSettingsStore.getState().settings.app.current_page).toBe("logs");
    expect(saveAppSettings).not.toHaveBeenCalled();
  });

  it("hydrate 之后每次修改都落盘", async () => {
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setCurrentPage("logs");

    expect(saveAppSettings).toHaveBeenCalledTimes(1);
    expect(saveAppSettings.mock.calls[0][0].app.current_page).toBe("logs");
  });

  it("落盘的是整份设置，不是被改的那一小块", async () => {
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setThemeMode("dark");
    await useSettingsStore.getState().setLogTypeFilter("error");

    const written = saveAppSettings.mock.calls[1][0];
    expect(written.settings.theme_mode).toBe("dark");
    expect(written.logs.type_filter).toBe("error");
    expect(written.connections.visible_columns.length).toBeGreaterThan(0);
  });

  it("每次修改产出的是新对象，不就地改上一份", async () => {
    // zustand 靠引用相等判断要不要重渲染；就地改的话页面不会更新。
    await useSettingsStore.getState().hydrate();
    const before = useSettingsStore.getState().settings;
    await useSettingsStore.getState().setThemeMode("dark");

    expect(useSettingsStore.getState().settings).not.toBe(before);
    expect(before.settings.theme_mode).toBe("system");
  });
});

describe("各个 setter 落在正确的区上", () => {
  beforeEach(async () => {
    await useSettingsStore.getState().hydrate();
  });

  it("页面、订阅、主题", async () => {
    const store = useSettingsStore.getState();
    await store.setSelectedProfile("abc");
    await store.setThemeMode("light");
    await store.setAutoCloseConnections(false);

    const s = useSettingsStore.getState().settings;
    expect(s.profiles.selected_profile_id).toBe("abc");
    expect(s.settings.theme_mode).toBe("light");
    expect(s.settings.auto_close_connections).toBe(false);
  });

  it("连接页的那一串", async () => {
    const store = useSettingsStore.getState();
    await store.setConnectionsTab("closed");
    await store.setConnectionsVisibleColumns(["host"]);
    await store.setConnectionsPinnedColumns(["host"]);
    await store.setConnectionsSortKey("upload");
    await store.setConnectionsSortDirection("asc");
    await store.setConnectionsGroupedColumn("host");
    await store.setConnectionsColumnSizes({ host: 120 });

    const c = useSettingsStore.getState().settings.connections;
    expect(c.current_tab).toBe("closed");
    expect(c.visible_columns).toEqual(["host"]);
    expect(c.pinned_columns).toEqual(["host"]);
    expect(c.sort_key).toBe("upload");
    expect(c.sort_direction).toBe("asc");
    expect(c.grouped_column).toBe("host");
    expect(c.column_sizes).toEqual({ host: 120 });
  });

  it("代理组折叠状态按组累加", async () => {
    const store = useSettingsStore.getState();
    await store.setProxyGroupCollapsed("g1", true);
    await store.setProxyGroupCollapsed("g2", false);

    expect(
      useSettingsStore.getState().settings.proxies.collapsed_groups,
    ).toEqual({ g1: true, g2: false });
  });

  it("更新相关的三个字段", async () => {
    const store = useSettingsStore.getState();
    await store.setCheckUpdateEnabled(true);
    await store.setUpdateCheckPrompted();
    await store.setLastShownUpdateVersion("1.2.3");

    const u = useSettingsStore.getState().settings.updates;
    expect(u.check_update_enabled).toBe(true);
    expect(u.update_check_prompted).toBe(true);
    expect(u.last_shown_update_version).toBe("1.2.3");
  });

  it("连接页展开状态只在内存里，不落盘", async () => {
    // 这是每次会话的临时视图状态，存下来没有意义。
    saveAppSettings.mockClear();
    useSettingsStore.getState().setConnectionExpandedGroups({ a: true });

    expect(useSettingsStore.getState().connectionExpandedGroups).toEqual({
      a: true,
    });
    expect(saveAppSettings).not.toHaveBeenCalled();
  });
});
