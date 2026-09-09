// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { DaemonConnectionPhase } from "../types/daemon";

/**
 * 相位归约 —— 每一次 `daemon-state-changed` 落到哪些副作用上。
 *
 * 这条路径替掉的是原来散落各处的判断（`initializeApp` 的一次性检查、
 * 窗口聚焦时的重连、5 秒一次的轮询循环），而且它对**每一种**运行状态变化都
 * 生效，不只是 fresh-box 自己发起的那些：daemon 开机自恢复、别的客户端停了
 * 实例、实例自己崩了，走的都是这里。
 */

const hooks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  snapshot: null as DaemonConnectionPhase | null,
  resolveSnapshot: null as ((phase: DaemonConnectionPhase) => void) | null,
  started: 0,
  stopped: [] as boolean[],
  visible: true,
  toastSuccess: [] as string[],
  toastError: [] as string[],
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (e: { payload: unknown }) => void) => {
    hooks.listeners.set(name, handler);
    return () => hooks.listeners.delete(name);
  },
}));
vi.mock("../services/api", () => ({
  getDaemonState: () =>
    hooks.snapshot
      ? Promise.resolve(hooks.snapshot)
      : new Promise<DaemonConnectionPhase>((resolve) => {
          hooks.resolveSnapshot = resolve;
        }),
}));
vi.mock("./streamLifecycle", () => ({
  startAllStreams: () => {
    hooks.started += 1;
  },
  stopAllStreams: (clear: boolean) => hooks.stopped.push(clear),
}));
vi.mock("./useWindowVisibility", () => ({
  isWindowVisible: () => hooks.visible,
}));
vi.mock("./useToast", () => ({
  useToast: () => ({
    success: (title: string) => hooks.toastSuccess.push(title),
    error: (title: string) => hooks.toastError.push(title),
    info: vi.fn(),
  }),
}));

import { useDaemonConnectionListener } from "./useDaemonConnection";
import { useSingboxStore } from "../stores/singboxStore";

const running: DaemonConnectionPhase = {
  phase: "connected",
  status: { state: "started", errorMessage: "" },
};
const stopped: DaemonConnectionPhase = {
  phase: "connected",
  status: { state: "idle", errorMessage: "" },
};
const crashed: DaemonConnectionPhase = {
  phase: "connected",
  status: { state: "fatal", errorMessage: "tun setup failed" },
};
const lost: DaemonConnectionPhase = {
  phase: "unavailable",
  errorMessage: "pipe closed",
};

function emit(phase: DaemonConnectionPhase) {
  act(() => hooks.listeners.get("daemon-state-changed")?.({ payload: phase }));
}

beforeEach(() => {
  hooks.listeners.clear();
  hooks.snapshot = stopped;
  hooks.resolveSnapshot = null;
  hooks.started = 0;
  hooks.stopped = [];
  hooks.visible = true;
  hooks.toastSuccess = [];
  hooks.toastError = [];
  useSingboxStore.setState({ isRunning: false, connectionPhase: stopped });
});

async function mount() {
  const view = renderHook(() => useDaemonConnectionListener());
  await act(async () => {});
  return view;
}

describe("运行状态变化", () => {
  it("跑起来时开流并提示一次", async () => {
    await mount();
    emit(running);

    expect(useSingboxStore.getState().isRunning).toBe(true);
    expect(hooks.started).toBe(1);
    expect(hooks.toastSuccess).toEqual(["sing-box is running."]);
  });

  it("同一个状态重复推送不会重复开流", async () => {
    await mount();
    emit(running);
    emit(running);
    expect(hooks.started).toBe(1);
  });

  it("窗口不可见时不开流 —— 由可见性监听自己接手", async () => {
    hooks.visible = false;
    await mount();
    emit(running);

    expect(useSingboxStore.getState().isRunning).toBe(true);
    expect(hooks.started).toBe(0);
  });

  it("干净地停止：停流 + 一条普通提示", async () => {
    await mount();
    emit(running);
    emit(stopped);

    expect(hooks.stopped).toEqual([true]);
    expect(hooks.toastSuccess).toContain("sing-box is stopped.");
    expect(hooks.toastError).toHaveLength(0);
  });

  it("崩溃是错误提示，并带上 daemon 给的原因", async () => {
    await mount();
    emit(running);
    emit(crashed);

    expect(hooks.toastError).toEqual(["sing-box has stopped unexpectedly."]);
  });

  it("整个掉出 connected 是「连接断了」，不是「实例停了」", async () => {
    // 两者对用户的含义不同：前者要看服务，后者只是没在跑。
    await mount();
    emit(running);
    emit(lost);

    expect(hooks.toastError).toEqual(["Lost connection to sing-box-daemon."]);
  });

  it("每一个相位都进 store，哪怕运行状态没变", async () => {
    await mount();
    emit({ phase: "not-installed" });
    expect(useSingboxStore.getState().connectionPhase.phase).toBe(
      "not-installed",
    );
    expect(hooks.toastSuccess).toHaveLength(0);
  });
});

describe("首帧", () => {
  it("启动时已经在跑，不弹「已启动」的提示", async () => {
    // 否则每次开机、每次开窗口都会来一条毫无意义的通知。
    hooks.snapshot = running;
    await mount();

    expect(useSingboxStore.getState().isRunning).toBe(true);
    expect(hooks.started).toBe(1);
    expect(hooks.toastSuccess).toHaveLength(0);
  });

  it("先到的事件优先，落后的快照不许覆盖它", async () => {
    // 快照是异步取的，完全可能比第一条事件还慢。让它写回去等于把最新状态
    // 换成一个更旧的。
    hooks.snapshot = null;
    await mount();

    emit(running);
    expect(useSingboxStore.getState().isRunning).toBe(true);

    await act(async () => {
      hooks.resolveSnapshot?.(stopped);
    });

    expect(useSingboxStore.getState().isRunning).toBe(true);
  });

  it("卸载后到达的快照不再写 store", async () => {
    hooks.snapshot = null;
    const { unmount } = await mount();
    unmount();

    await act(async () => {
      hooks.resolveSnapshot?.(running);
    });

    expect(useSingboxStore.getState().isRunning).toBe(false);
  });
});
