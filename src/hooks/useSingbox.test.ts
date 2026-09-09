// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createDefaultAppSettings } from "../types/app";

/**
 * 启停入口。
 *
 * 这个 hook 剩下的全部职责就是「发 RPC + 立刻失败时报错」—— 运行状态、流的
 * 起停、成功提示、系统通知都由 `useDaemonConnectionListener` 统一处理（那样
 * daemon 自恢复、别的客户端操作也一样能反应过来）。所以这里测的是防抖条件，
 * 那是唯一还留在这里的判断。
 */

const startSingbox = vi.fn(async (_id: string) => null);
const stopSingbox = vi.fn(async () => null);
vi.mock("../services/api", () => ({
  startSingbox: (id: string) => startSingbox(id),
  stopSingbox: () => stopSingbox(),
}));
const toasts = vi.hoisted(() => ({
  info: [] as string[],
  error: [] as string[],
}));
vi.mock("./useToast", () => ({
  useToast: () => ({
    info: (m: string) => toasts.info.push(m),
    error: (m: string) => toasts.error.push(m),
    success: vi.fn(),
  }),
}));

import { useSingbox } from "./useSingbox";
import { useSingboxStore } from "../stores/singboxStore";
import { useSettingsStore } from "../stores/settingsStore";

function selectProfile(id: string | null) {
  const settings = createDefaultAppSettings();
  settings.profiles.selected_profile_id = id;
  useSettingsStore.setState({ settings, hydrated: true });
}

beforeEach(() => {
  startSingbox.mockClear().mockResolvedValue(null);
  stopSingbox.mockClear().mockResolvedValue(null);
  toasts.info = [];
  toasts.error = [];
  useSingboxStore.setState({ isRunning: false, pendingOperation: false });
  selectProfile("profile-1");
});

describe("startService", () => {
  it("用当前选中的档案 id 启动", async () => {
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService());

    expect(startSingbox).toHaveBeenCalledWith("profile-1");
    expect(useSingboxStore.getState().pendingOperation).toBe(false);
  });

  it("没有选中档案就什么都不做", async () => {
    selectProfile(null);
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService());

    expect(startSingbox).not.toHaveBeenCalled();
  });

  it("已经在跑时不重复启动", async () => {
    useSingboxStore.setState({ isRunning: true });
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService());

    expect(startSingbox).not.toHaveBeenCalled();
  });

  it("但 reload 会穿过那道防抖 —— 换配置就是同一个调用", async () => {
    // daemon 的 `StartService` 本身就是 `StartOrReloadService`，所以换配置
    // 不需要先停（审计项 H-02）。
    useSingboxStore.setState({ isRunning: true });
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService({ reload: true }));

    expect(startSingbox).toHaveBeenCalledWith("profile-1");
    expect(toasts.info).toContain("Reloading sing-box…");
  });

  it("有操作在途时不并发", async () => {
    useSingboxStore.setState({ pendingOperation: true });
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService());

    expect(startSingbox).not.toHaveBeenCalled();
  });

  it("失败会报错，并且把在途标记清掉", async () => {
    startSingbox.mockRejectedValueOnce(new Error("config invalid"));
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.startService());

    expect(toasts.error[0]).toContain("config invalid");
    expect(useSingboxStore.getState().pendingOperation).toBe(false);
  });
});

describe("stopService", () => {
  it("在跑才停", async () => {
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.stopService());
    expect(stopSingbox).not.toHaveBeenCalled();

    useSingboxStore.setState({ isRunning: true });
    await act(() => result.current.stopService());
    expect(stopSingbox).toHaveBeenCalled();
  });

  it("失败照样清掉在途标记", async () => {
    useSingboxStore.setState({ isRunning: true });
    stopSingbox.mockRejectedValueOnce(new Error("timeout"));
    const { result } = renderHook(() => useSingbox());
    await act(() => result.current.stopService());

    expect(toasts.error[0]).toContain("timeout");
    expect(useSingboxStore.getState().pendingOperation).toBe(false);
  });
});
