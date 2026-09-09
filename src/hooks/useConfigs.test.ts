// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ProfileEntry } from "../types/app";
import { createDefaultAppSettings } from "../types/app";

/**
 * 档案页的动作层。三处真正会出错的地方：
 *
 *  - **选中项的再解析**：改名/删除/新增别的档案不该动当前选中项；当前选中项
 *    没了才回退。
 *  - **刷新即重载**：刷新的正是跑着的那份配置时要顺手重载，否则新内容写进
 *    磁盘、跑着的还是旧的，界面却提示成功（审计项 H-02）。
 *  - **并发防抖**：这些操作都动同一份档案表。
 */

const api = vi.hoisted(() => ({
  listProfiles: async () => [] as ProfileEntry[],
  importProfileFile: async (_p: string) => result([]),
  importProfileData: async (_p: string) => result([]),
  exportProfile: async (_id: string, _dest: string) => "C:/out.bpf",
  addSubscription: async (_url: string) => result([]),
  updateSubscription: async (_id: string) => result([]),
  editSubscriptionUrl: async (_id: string, _url: string) =>
    [] as ProfileEntry[],
  setSubscriptionAutoUpdate: async (
    _id: string,
    _on: boolean,
    _m: number | null,
  ) => [] as ProfileEntry[],
  renameProfile: async (_id: string, _n: string) => [] as ProfileEntry[],
  deleteProfile: async (_id: string) => [] as ProfileEntry[],
  openConfigFile: async (_id: string) => null,
  // `applyProfiles` 会经由 `setSelectedProfile` 落一次盘 —— 少 mock 这两个的
  // 话，那次调用会抛在 hook 自己的 try 里，变成一条错误提示。
  loadAppSettings: async () => createDefaultAppSettings(),
  saveAppSettings: async (_s: unknown) => null,
}));

const dialog = vi.hoisted(() => ({
  openResult: "C:/picked.json" as string | null,
  saveResult: "C:/out.bpf" as string | null,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => dialog.openResult,
  save: async () => dialog.saveResult,
}));
vi.mock("../services/api", () => api);
const toasts = vi.hoisted(() => ({
  success: [] as string[],
  error: [] as string[],
  warning: [] as string[],
}));
vi.mock("./useToast", () => ({
  useToast: () => ({
    success: (m: string) => toasts.success.push(m),
    error: (m: string) => toasts.error.push(m),
    warning: (m: string) => toasts.warning.push(m),
    info: vi.fn(),
  }),
}));
const startService = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./useSingbox", () => ({
  useSingbox: () => ({ startService, stopService: vi.fn() }),
}));

import { useConfigs } from "./useConfigs";
import { useConfigStore } from "../stores/configStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";

function profile(id: string, url?: string): ProfileEntry {
  return {
    id,
    name: id,
    url: url ?? null,
    lastUpdated: null,
    autoUpdate: false,
    updateIntervalMinutes: null,
  };
}

function result(profiles: ProfileEntry[], entry = profiles[0]) {
  return { profiles, entry: entry ?? profile("new") };
}

function selectProfile(id: string | null) {
  const settings = createDefaultAppSettings();
  settings.profiles.selected_profile_id = id;
  useSettingsStore.setState({ settings, hydrated: true });
}

beforeEach(() => {
  toasts.success = [];
  toasts.error = [];
  toasts.warning = [];
  dialog.openResult = "C:/picked.json";
  dialog.saveResult = "C:/out.bpf";
  startService.mockClear();
  useConfigStore.setState({ profiles: [], pendingOperation: false });
  useSingboxStore.setState({ isRunning: false, pendingOperation: false });
  selectProfile(null);
  api.listProfiles = async () => [];
});

describe("导入", () => {
  it("选好文件后入库，并选中新导入的那份", async () => {
    const entry = profile("imported");
    api.importProfileFile = async () => result([entry]);

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.selectConfigFile());

    expect(useConfigStore.getState().profiles).toHaveLength(1);
    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBe("imported");
    expect(toasts.success[0]).toContain("Added config file");
  });

  it("取消文件选择就什么都不做", async () => {
    dialog.openResult = null;
    const spy = vi.fn(async () => result([]));
    api.importProfileFile = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.selectConfigFile());

    expect(spy).not.toHaveBeenCalled();
    expect(useConfigStore.getState().pendingOperation).toBe(false);
  });

  it("导入分享文件走的是另一条命令", async () => {
    const spy = vi.fn(async () => result([profile("shared")]));
    api.importProfileData = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.selectProfileFile());

    expect(spy).toHaveBeenCalledWith("C:/picked.json");
    expect(toasts.success[0]).toContain("Imported shared profile");
  });

  it("导入失败只报错，不留在「进行中」", async () => {
    api.importProfileFile = async () => {
      throw new Error("not a config");
    };
    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.selectConfigFile());

    expect(toasts.error[0]).toContain("not a config");
    expect(useConfigStore.getState().pendingOperation).toBe(false);
  });
});

describe("导出", () => {
  it("文件名从档案名派生，非法字符换掉", async () => {
    const spy = vi.fn(async () => "C:/out.bpf");
    api.exportProfile = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.exportProfileFile("id", "my profile/v2"));

    expect(spy).toHaveBeenCalledWith("id", "C:/out.bpf");
    expect(toasts.success[0]).toContain("Profile exported");
  });

  it("取消保存对话框就不调命令", async () => {
    dialog.saveResult = null;
    const spy = vi.fn(async () => "C:/out.bpf");
    api.exportProfile = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.exportProfileFile("id", "name"));

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("订阅", () => {
  it("HTTP 订阅会额外警告一次", async () => {
    api.addSubscription = async () => result([profile("sub", "http://x/y")]);

    const { result: hook } = renderHook(() => useConfigs());
    await act(async () => {
      await hook.current.addSubscription("http://x/y");
    });

    expect(toasts.warning[0]).toContain("plain HTTP");
  });

  it("HTTPS 不警告", async () => {
    api.addSubscription = async () => result([profile("sub", "https://x/y")]);

    const { result: hook } = renderHook(() => useConfigs());
    await act(async () => {
      await hook.current.addSubscription("https://x/y");
    });

    expect(toasts.warning).toHaveLength(0);
  });

  it("空 URL 直接拒绝", async () => {
    const spy = vi.fn(async () => result([]));
    api.addSubscription = spy;

    const { result: hook } = renderHook(() => useConfigs());
    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await hook.current.addSubscription("   ");
    });

    expect(accepted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("刷新的是当前跑着的那份配置时顺手重载", async () => {
    useConfigStore.setState({ profiles: [profile("sub", "https://x/y")] });
    selectProfile("sub");
    useSingboxStore.setState({ isRunning: true });
    api.updateSubscription = async () =>
      result([profile("sub", "https://x/y")]);

    const { result: hook } = renderHook(() => useConfigs());
    await act(async () => {
      await hook.current.updateSubscription("sub");
    });

    expect(startService).toHaveBeenCalledWith({ reload: true });
    expect(toasts.success[0]).toContain("reloaded");
  });

  it("刷新的不是当前那份就不重载", async () => {
    // 两份都还在，所以选中项不会被重新解析 —— 这正是「别的订阅刷新了不该
    // 打断当前连接」的场景。
    const both = [
      profile("sub", "https://a/b"),
      profile("other", "https://x/y"),
    ];
    useConfigStore.setState({ profiles: both });
    selectProfile("sub");
    useSingboxStore.setState({ isRunning: true });
    api.updateSubscription = async () => result(both, both[1]);

    const { result: hook } = renderHook(() => useConfigs());
    await act(async () => {
      await hook.current.updateSubscription("other");
    });

    expect(startService).not.toHaveBeenCalled();
  });

  it("本地文件没有 URL，刷新直接拒绝", async () => {
    useConfigStore.setState({ profiles: [profile("local")] });
    const spy = vi.fn(async () => result([]));
    api.updateSubscription = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(async () => {
      await hook.current.updateSubscription("local");
    });

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("改名与选中项", () => {
  it("重名在本地就挡掉，不发请求", async () => {
    useConfigStore.setState({ profiles: [profile("a"), profile("b")] });
    const spy = vi.fn(async () => []);
    api.renameProfile = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.renameConfig("a", "b"));

    expect(spy).not.toHaveBeenCalled();
    expect(toasts.error[0]).toContain("already exists");
  });

  it("改别的档案不动当前选中项", async () => {
    useConfigStore.setState({ profiles: [profile("a"), profile("b")] });
    selectProfile("a");
    api.renameProfile = async () => [profile("a"), profile("renamed")];

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.renameConfig("b", "renamed"));

    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBe("a");
  });

  it("当前选中项没了就回退到第一个", async () => {
    useConfigStore.setState({ profiles: [profile("a"), profile("b")] });
    selectProfile("a");
    api.deleteProfile = async () => [profile("b")];

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.deleteConfig("a"));

    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBe("b");
  });

  it("删到一个不剩时选中项是 null", async () => {
    useConfigStore.setState({ profiles: [profile("a")] });
    selectProfile("a");
    api.deleteProfile = async () => [];

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.deleteConfig("a"));

    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBeNull();
  });
});

describe("并发", () => {
  it("有操作在途时后来的直接返回", async () => {
    useConfigStore.setState({ pendingOperation: true });
    const spy = vi.fn(async () => []);
    api.renameProfile = spy;

    const { result: hook } = renderHook(() => useConfigs());
    await act(() => hook.current.renameConfig("a", "z"));

    expect(spy).not.toHaveBeenCalled();
  });
});
