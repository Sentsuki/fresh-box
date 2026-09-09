// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * 日志页。三处有真实分支的地方：
 *
 *  - 缓冲区：每条日志都触发一次渲染的话，刷屏时页面直接卡死，所以先攒着，
 *    100 ms 刷一次。
 *  - `disabled` 状态：日志在 priority config 里被关掉时，页面要说「被配置
 *    关掉了」而不是「未连接」，而且这个状态不能被流的生命周期覆盖。
 *  - 搜索：多个词是「全都要匹配」，跨字段。
 */

const hooks = vi.hoisted(() => ({
  emitStatus: (_status: string) => {},
  emitLog: (_log: unknown) => {},
  logDisabled: false,
  priorityFails: false,
  started: 0,
  stopped: 0,
}));

vi.mock("../daemon/subscription", () => ({
  createStreamController: (options: {
    onMessage: (m: unknown) => void;
    onStatus: (s: string) => void;
  }) => {
    hooks.emitLog = (log) => options.onMessage(log);
    hooks.emitStatus = (s) => options.onStatus(s);
    return {
      start: () => {
        hooks.started += 1;
      },
      stop: (onStopped?: () => void) => {
        hooks.stopped += 1;
        onStopped?.();
      },
    };
  },
}));
vi.mock("../daemon/clients", () => ({
  startedService: { subscribeLog: vi.fn() },
}));
vi.mock("../services/api", () => ({
  loadPriorityConfig: async () => {
    if (hooks.priorityFails) throw new Error("no daemon");
    return {
      log: { disabled: hooks.logDisabled, level: "info" },
      inbounds: [],
    };
  },
}));
vi.mock("./useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  startLogsStream,
  stopLogsStream,
  useLogsStore,
  useLogsStream,
} from "./useLogsStream";
import { useSettingsStore } from "../stores/settingsStore";
import { createDefaultAppSettings } from "../types/app";

beforeEach(() => {
  hooks.logDisabled = false;
  hooks.priorityFails = false;
  hooks.started = 0;
  hooks.stopped = 0;
  useLogsStore.getState().clearLogs();
  useLogsStore.getState().setStreamStatus("disconnected");
  useLogsStore.getState().setSearch("");
  useSettingsStore.setState({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},
  });
});

function log(message: string, level = 4) {
  return { messages: [{ level, message }], reset: false };
}

describe("缓冲", () => {
  it("推进来的日志先进缓冲，flush 之后才可见", () => {
    hooks.emitLog(log("hello"));
    expect(useLogsStore.getState().logs).toHaveLength(0);

    useLogsStore.getState().flushBuffer();
    expect(useLogsStore.getState().logs).toHaveLength(1);
    expect(useLogsStore.getState().logs[0].payload).toBe("hello");
  });

  it("空缓冲 flush 是空操作", () => {
    const before = useLogsStore.getState().logs;
    useLogsStore.getState().flushBuffer();
    // 引用没变 = 没有触发无谓的渲染。
    expect(useLogsStore.getState().logs).toBe(before);
  });

  it("日志条数有上限，超了丢最旧的", () => {
    for (let i = 0; i < 2100; i += 1) hooks.emitLog(log(`line ${i}`));
    useLogsStore.getState().flushBuffer();

    const logs = useLogsStore.getState().logs;
    expect(logs).toHaveLength(2000);
    expect(logs[logs.length - 1].payload).toBe("line 2099");
  });

  it("暂停时不再收新日志", () => {
    useLogsStore.getState().setIsPaused(true);
    hooks.emitLog(log("dropped"));
    useLogsStore.getState().flushBuffer();
    expect(useLogsStore.getState().logs).toHaveLength(0);
  });

  it("每条日志带上级别与分类", () => {
    hooks.emitLog(log("[dns] lookup failed", 2));
    useLogsStore.getState().flushBuffer();
    const entry = useLogsStore.getState().logs[0];
    expect(entry.type).toBe("error");
    expect(entry.category).toBe("dns");
  });

  it("剥掉颜色转义再入库", () => {
    const ESC = "\u001b";
    hooks.emitLog(log(`${ESC}[31m[dns]${ESC}[0m boom`));
    useLogsStore.getState().flushBuffer();
    expect(useLogsStore.getState().logs[0].payload).toBe("[dns] boom");
  });
});

describe("配置里关掉日志时", () => {
  it("不建流，状态是 disabled", async () => {
    hooks.logDisabled = true;
    await startLogsStream();

    expect(hooks.started).toBe(0);
    expect(useLogsStore.getState().streamStatus).toBe("disabled");
  });

  it("disabled 不会被流状态覆盖掉", async () => {
    hooks.logDisabled = true;
    await startLogsStream();

    hooks.emitStatus("connecting");
    expect(useLogsStore.getState().streamStatus).toBe("disabled");

    await stopLogsStream();
    expect(useLogsStore.getState().streamStatus).toBe("disabled");
  });

  it("重新启用后状态跟着回来", async () => {
    hooks.logDisabled = true;
    await startLogsStream();
    hooks.logDisabled = false;
    await startLogsStream();

    expect(hooks.started).toBe(1);
    expect(useLogsStore.getState().streamStatus).not.toBe("disabled");
  });

  it("读配置失败时照常订阅", async () => {
    // 顶多是条空流，比因为读配置失败就看不到日志强。
    hooks.priorityFails = true;
    await startLogsStream();
    expect(hooks.started).toBe(1);
  });
});

describe("搜索与筛选", () => {
  function seed() {
    hooks.emitLog(log("[dns] lookup example.com"));
    hooks.emitLog(log("[router] matched rule", 3));
    useLogsStore.getState().flushBuffer();
  }

  it("多个词是「全都要匹配」", () => {
    seed();
    const { result, rerender } = renderHook(() => useLogsStream());
    expect(result.current.visibleLogs).toHaveLength(2);

    act(() => useLogsStore.getState().setSearch("dns example"));
    rerender();
    expect(result.current.visibleLogs).toHaveLength(1);

    act(() => useLogsStore.getState().setSearch("dns router"));
    rerender();
    expect(result.current.visibleLogs).toHaveLength(0);
  });

  it("按分类筛选", () => {
    seed();
    const { result, rerender } = renderHook(() => useLogsStream());

    act(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, logs: { type_filter: "router" } },
      }));
    });
    rerender();
    expect(result.current.visibleLogs).toHaveLength(1);
    expect(result.current.visibleLogs[0].category).toBe("router");
  });

  it("按级别筛选用的是同一个字段", () => {
    // `type_filter` 同时匹配分类和级别 —— 下拉里两种选项混在一起。
    seed();
    const { result, rerender } = renderHook(() => useLogsStream());

    act(() => {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, logs: { type_filter: "warning" } },
      }));
    });
    rerender();
    expect(result.current.visibleLogs).toHaveLength(1);
    expect(result.current.visibleLogs[0].type).toBe("warning");
  });
});
