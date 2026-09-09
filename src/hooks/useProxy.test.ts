// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * `useProxy` 本身没有逻辑，它做的唯一一件事是把 store 动作的回调接到 toast
 * 上。值得测的也就是这一件：**测速超时走的是 info 不是 success**（那不是
 * 成功，也不是错误），以及每个动作的成功/失败分别落到哪一类提示上。
 */

const store = vi.hoisted(() => ({
  refreshOverview: vi.fn(async (_showToast?: boolean) => {}),
  changeMode: vi.fn(
    async (_m: string, ok?: (s: string) => void, _e?: (s: string) => void) =>
      ok?.("mode ok"),
  ),
  switchProxy: vi.fn(
    async (
      _g: string,
      _n: string,
      ok?: (s: string) => void,
      _e?: (s: string) => void,
    ) => ok?.("switched"),
  ),
  testDelay: vi.fn(
    async (
      _n: string,
      onResult?: (s: string, ok: boolean) => void,
      _e?: (s: string) => void,
    ) => onResult?.("n: 42 ms", true),
  ),
  testGroupDelay: vi.fn(
    async (_g: string, ok?: (s: string) => void, _e?: (s: string) => void) =>
      ok?.("tested"),
  ),
}));
vi.mock("../stores/proxyStore", () => ({
  useProxyStore: { getState: () => store },
}));

const toasts = vi.hoisted(() => ({
  success: [] as string[],
  error: [] as string[],
  info: [] as string[],
}));
vi.mock("./useToast", () => ({
  useToast: () => ({
    success: (m: string) => toasts.success.push(m),
    error: (m: string) => toasts.error.push(m),
    info: (m: string) => toasts.info.push(m),
  }),
}));

import { useProxy } from "./useProxy";

beforeEach(() => {
  toasts.success = [];
  toasts.error = [];
  toasts.info = [];
  for (const fn of Object.values(store)) fn.mockClear();
});

describe("useProxy", () => {
  it("刷新是显式请求，所以出错要提示", async () => {
    const { result } = renderHook(() => useProxy());
    await act(() => result.current.refreshOverview());
    expect(store.refreshOverview).toHaveBeenCalledWith(true);
  });

  it("切模式 / 切节点 / 组测速的成功都走 success", async () => {
    const { result } = renderHook(() => useProxy());
    await act(() => result.current.changeMode("global"));
    await act(() => result.current.switchProxy("manual", "b"));
    await act(() => result.current.testGroupDelay("manual"));

    expect(toasts.success).toEqual(["mode ok", "switched", "tested"]);
  });

  it("单节点测速：有结果是 success", async () => {
    const { result } = renderHook(() => useProxy());
    await act(() => result.current.testDelay("b"));
    expect(toasts.success).toEqual(["n: 42 ms"]);
  });

  it("单节点测速：超时走 info —— 那既不是成功也不是错误", async () => {
    store.testDelay.mockImplementationOnce(async (_n, onResult) =>
      onResult?.("b: timeout", false),
    );
    const { result } = renderHook(() => useProxy());
    await act(() => result.current.testDelay("b"));

    expect(toasts.info).toEqual(["b: timeout"]);
    expect(toasts.error).toHaveLength(0);
  });

  it("失败一律走 error", async () => {
    store.changeMode.mockImplementationOnce(async (_m, _ok, onError) =>
      onError?.("boom"),
    );
    const { result } = renderHook(() => useProxy());
    await act(() => result.current.changeMode("global"));

    expect(toasts.error).toEqual(["boom"]);
  });
});
