// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * 流的起停编排。
 *
 * 值得钉住的是「全部」这个词：每个判断点（sing-box 起停、窗口显隐）要起停的
 * 都是**所有**流。漏掉一条的表现是某个页面静默地不再更新，而且只在特定路径上
 * 出现 —— 手测很难发现。
 */

const started = vi.hoisted(() => [] as string[]);
const stopped = vi.hoisted(() => [] as { name: string; clear: unknown }[]);

vi.mock("./useConnectionsStream", () => ({
  startConnectionsStream: () => started.push("connections"),
  stopConnectionsStream: (clear: boolean) =>
    stopped.push({ name: "connections", clear }),
}));
vi.mock("./useLogsStream", () => ({
  startLogsStream: async () => started.push("logs"),
  stopLogsStream: async (clear: boolean) =>
    stopped.push({ name: "logs", clear }),
}));
vi.mock("../daemon/statusStream", () => ({
  startStatusStream: () => started.push("status"),
  stopStatusStream: (clear: boolean) => stopped.push({ name: "status", clear }),
}));
vi.mock("../daemon/groupsStream", () => ({
  startGroupsStream: () => started.push("groups"),
  stopGroupsStream: () => stopped.push({ name: "groups", clear: undefined }),
}));

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    name: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

import { startAllStreams, stopAllStreams } from "./streamLifecycle";
import { useSingboxStore } from "../stores/singboxStore";
import {
  isWindowVisible,
  useWindowVisibilityListener,
  useWindowVisibilityStore,
} from "./useWindowVisibility";

beforeEach(() => {
  started.length = 0;
  stopped.length = 0;
  listeners.clear();
  useSingboxStore.getState().setRunning(false);
  useWindowVisibilityStore.getState().setVisible(true);
});

describe("startAllStreams / stopAllStreams", () => {
  it("四条流一条不少", () => {
    startAllStreams();
    expect(started.sort()).toEqual(["connections", "groups", "logs", "status"]);
  });

  it("停的时候也是四条，clear 透传下去", () => {
    stopAllStreams(true);
    expect(stopped.map((s) => s.name).sort()).toEqual([
      "connections",
      "groups",
      "logs",
      "status",
    ]);
    // 代理组没有可清的缓存（断连时它自己清），其余三条要跟着清。
    expect(
      stopped.filter((s) => s.name !== "groups").every((s) => s.clear === true),
    ).toBe(true);
  });
});

describe("窗口显隐", () => {
  it("隐藏时停掉全部并清缓存", async () => {
    renderHook(() => useWindowVisibilityListener());
    await act(async () => {});

    act(() => listeners.get("window-visibility-changed")?.({ payload: false }));

    expect(isWindowVisible()).toBe(false);
    expect(stopped).toHaveLength(4);
    expect(started).toHaveLength(0);
  });

  it("重新显示且 sing-box 在跑时才重新起流", async () => {
    renderHook(() => useWindowVisibilityListener());
    await act(async () => {});

    act(() => listeners.get("window-visibility-changed")?.({ payload: true }));
    expect(started).toHaveLength(0);

    useSingboxStore.getState().setRunning(true);
    act(() => listeners.get("window-visibility-changed")?.({ payload: true }));
    expect(started).toHaveLength(4);
  });

  it("卸载时摘掉监听", async () => {
    const { unmount } = renderHook(() => useWindowVisibilityListener());
    await act(async () => {});
    expect(listeners.has("window-visibility-changed")).toBe(true);

    unmount();
    expect(listeners.has("window-visibility-changed")).toBe(false);
  });
});
