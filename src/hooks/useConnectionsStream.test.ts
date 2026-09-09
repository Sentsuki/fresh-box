// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ConnectionEntry } from "../types/app";

vi.mock("../daemon/clients", () => ({
  startedService: { closeConnection: vi.fn(async () => ({})) },
}));
// Fluent UI 的 toast 在这条 import 链上；测试用不到，断掉能省十几秒的转换。
vi.mock("./useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("../daemon/connectionsStream", () => ({
  startConnectionsStream: vi.fn(),
  stopConnectionsStream: vi.fn(),
}));

import {
  allColumns,
  formatConnectionValue,
  useConnectionsStore,
  useConnectionsStream,
} from "./useConnectionsStream";
import { useSettingsStore } from "../stores/settingsStore";
import { createDefaultAppSettings } from "../types/app";

function entry(over: Partial<ConnectionEntry> = {}): ConnectionEntry {
  return {
    id: "1",
    metadata: {
      network: "tcp",
      type: "mixed",
      host: "example.com",
      sourceIP: "127.0.0.1",
      sourcePort: "5000",
      destinationIP: "1.1.1.1",
      destinationPort: "443",
      remoteDestination: "1.1.1.1:443",
      sniffHost: "example.com",
      inboundUser: "",
      inboundName: "mixed-in",
    },
    upload: 0,
    download: 0,
    start: new Date().toISOString(),
    chains: ["proxy", "manual"],
    rule: "final",
    uploadSpeed: 0,
    downloadSpeed: 0,
    ...over,
  };
}

beforeEach(() => {
  useConnectionsStore.getState().clear();
  useSettingsStore.setState({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},
  });
});

describe("连接 store", () => {
  it("整帧替换，暂停时不动", () => {
    const frame = {
      connections: [entry()],
      closed: [],
      totalDownloadSpeed: 10,
      totalUploadSpeed: 20,
    };
    useConnectionsStore.getState().setFrame(frame);
    expect(useConnectionsStore.getState().active).toHaveLength(1);

    useConnectionsStore.getState().setIsPaused(true);
    useConnectionsStore.getState().setFrame({ ...frame, connections: [] });
    // 暂停的意思是「画面定住」，不是「丢掉数据」。
    expect(useConnectionsStore.getState().active).toHaveLength(1);
  });

  it("clear 把暂停状态也一并复位", () => {
    useConnectionsStore.getState().setIsPaused(true);
    useConnectionsStore.getState().clear();
    expect(useConnectionsStore.getState().isPaused).toBe(false);
    expect(useConnectionsStore.getState().streamStatus).toBe("disconnected");
  });
});

describe("formatConnectionValue", () => {
  it("链路倒着显示 —— 出站在最右", () => {
    expect(formatConnectionValue("chain", entry())).toBe("manual → proxy");
    expect(formatConnectionValue("outbound", entry())).toBe("proxy");
  });

  it("主机名带端口，IPv6 加方括号", () => {
    expect(formatConnectionValue("host", entry())).toBe("example.com:443");
    expect(
      formatConnectionValue(
        "host",
        entry({
          metadata: { ...entry().metadata, host: "2001:db8::1" },
        }),
      ),
    ).toBe("[2001:db8::1]:443");
  });

  it("目标类型按地址形态分类", () => {
    const withDest = (destinationIP: string, host = "") =>
      entry({ metadata: { ...entry().metadata, destinationIP, host } });
    expect(formatConnectionValue("destinationType", withDest("1.1.1.1"))).toBe(
      "IPv4",
    );
    expect(
      formatConnectionValue("destinationType", withDest("2001:db8::1")),
    ).toBe("IPv6");
    expect(
      formatConnectionValue("destinationType", withDest("", "a.com")),
    ).toBe("FQDN");
  });

  it("进程名取不到时退回路径尾巴，再取不到就是占位符", () => {
    expect(
      formatConnectionValue(
        "process",
        entry({
          metadata: {
            ...entry().metadata,
            process: undefined,
            processPath: "C:/Program Files/app/thing.exe",
          },
        }),
      ),
    ).toBe("thing.exe");
    expect(formatConnectionValue("process", entry())).toBe("-");
  });

  it("空字段一律给占位符而不是空白", () => {
    const bare = entry({
      metadata: {
        ...entry().metadata,
        sniffHost: "",
        inboundUser: "",
        inboundName: "",
      },
      chains: [],
    });
    expect(formatConnectionValue("sniffHost", bare)).toBe("-");
    expect(formatConnectionValue("outbound", bare)).toBe("-");
    expect(formatConnectionValue("inboundUser", bare)).toBe("-");
  });

  it("每一列都有格式化实现", () => {
    // `formatConnectionValue` 是一个穷举 switch —— 加了新列忘了这里，
    // TypeScript 会报错，而这条测试保证运行时也真的没有 undefined。
    for (const column of allColumns) {
      expect(
        formatConnectionValue(column.key, entry()),
        `column ${column.key}`,
      ).toBeTypeOf("string");
    }
  });
});

describe("useConnectionsStream", () => {
  it("按当前排序键排序，方向可反转", () => {
    useConnectionsStore.getState().setFrame({
      connections: [
        entry({ id: "slow", downloadSpeed: 1 }),
        entry({ id: "fast", downloadSpeed: 100 }),
      ],
      closed: [],
      totalDownloadSpeed: 101,
      totalUploadSpeed: 0,
    });

    const { result, rerender } = renderHook(() => useConnectionsStream());
    // 默认按下载速度降序。
    expect(result.current.entries.map((c) => c.id)).toEqual(["fast", "slow"]);

    act(() => {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          connections: { ...s.settings.connections, sort_direction: "asc" },
        },
      }));
    });
    rerender();
    expect(result.current.entries.map((c) => c.id)).toEqual(["slow", "fast"]);
  });

  it("切换标签页换的是数据源", () => {
    useConnectionsStore.getState().setFrame({
      connections: [entry({ id: "active" })],
      closed: [entry({ id: "closed" })],
      totalDownloadSpeed: 0,
      totalUploadSpeed: 0,
    });

    const { result, rerender } = renderHook(() => useConnectionsStream());
    expect(result.current.entries.map((c) => c.id)).toEqual(["active"]);

    act(() => {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          connections: { ...s.settings.connections, current_tab: "closed" },
        },
      }));
    });
    rerender();
    expect(result.current.entries.map((c) => c.id)).toEqual(["closed"]);
  });
});
