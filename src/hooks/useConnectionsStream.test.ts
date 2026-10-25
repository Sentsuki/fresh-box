// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ConnectionEntry } from "../types/app";

vi.mock("../daemon/clients", () => ({
  startedService: { closeConnection: vi.fn(async () => ({})) },
}));
// toast 在这条 import 链上；测试用不到，断掉省得拉进 Base UI。
vi.mock("./useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("../daemon/connectionsStream", () => ({
  startConnectionsStream: vi.fn(),
  stopConnectionsStream: vi.fn(),
}));

import {
  allColumns,
  connectionSortFn,
  formatConnectionValue,
  type SortableConnectionRow,
  useConnectionsStore,
  useConnectionsStream,
} from "./useConnectionsStream";
import {
  getCoreRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
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

  it("累计流量按字节显示，只有速度列带 /s", () => {
    const e = entry({ download: 2048, upload: 1024, downloadSpeed: 2048 });
    expect(formatConnectionValue("download", e)).toBe("2.00 KB");
    expect(formatConnectionValue("upload", e)).toBe("1.00 KB");
    expect(formatConnectionValue("downloadSpeed", e)).toBe("2.00 KB/s");
  });

  it("每一列都有格式化实现", () => {
    // 列定义是 `Record<ConnectionColumnKey, …>`，漏一列 TypeScript 会报错；
    // 这条测试保证运行时每一列也真的给出字符串，而不是 undefined。
    for (const column of allColumns) {
      expect(
        formatConnectionValue(column.key, entry()),
        `column ${column.key}`,
      ).toBeTypeOf("string");
    }
  });
});

/** 造一个排序函数能用的行。传了 `leaves` 就是组行。 */
function row(
  original: ConnectionEntry,
  leaves?: ConnectionEntry[],
): SortableConnectionRow {
  return {
    original,
    getIsGrouped: () => leaves !== undefined,
    getLeafRows: () => (leaves ?? []).map((leaf) => row(leaf)),
  };
}

describe("connectionSortFn", () => {
  it("数值列按大小比，不是按显示出来的字符串比", () => {
    // 字符串比的话 "9.00 B/s" > "100 B/s"。
    const sort = connectionSortFn("downloadSpeed", false);
    const nine = row(entry({ id: "nine", downloadSpeed: 9 }));
    const hundred = row(entry({ id: "hundred", downloadSpeed: 100 }));
    expect(sort(nine, hundred)).toBeLessThan(0);
    expect(sort(hundred, nine)).toBeGreaterThan(0);
  });

  it("排序列被隐藏也照样能比 —— 用的是列定义，不是表格里的列", () => {
    const sort = connectionSortFn("inboundUser", false);
    const a = entry({ id: "a" });
    a.metadata = { ...a.metadata, inboundUser: "alice" };
    const b = entry({ id: "b" });
    b.metadata = { ...b.metadata, inboundUser: "bob" };
    expect(sort(row(a), row(b))).toBeLessThan(0);
  });

  it("组行拿组内排在最前的那条来比：降序取最大", () => {
    // 组 x 的第一条原始数据很慢，但组里有最快的一条 —— 降序时它应该排前面。
    const groupX = row(entry({ id: "x-slow", downloadSpeed: 1 }), [
      entry({ id: "x-slow", downloadSpeed: 1 }),
      entry({ id: "x-fast", downloadSpeed: 500 }),
    ]);
    const groupY = row(entry({ id: "y", downloadSpeed: 100 }), [
      entry({ id: "y", downloadSpeed: 100 }),
    ]);
    const desc = connectionSortFn("downloadSpeed", true);
    // 表格降序时会把结果取反：x 的代表值 500 > 100，取反后 x 在前。
    expect(desc(groupX, groupY)).toBeGreaterThan(0);
  });

  it("升序取最小", () => {
    const groupX = row(entry({ id: "x-fast", downloadSpeed: 500 }), [
      entry({ id: "x-fast", downloadSpeed: 500 }),
      entry({ id: "x-slow", downloadSpeed: 1 }),
    ]);
    const groupY = row(entry({ id: "y", downloadSpeed: 100 }), [
      entry({ id: "y", downloadSpeed: 100 }),
    ]);
    expect(
      connectionSortFn("downloadSpeed", false)(groupX, groupY),
    ).toBeLessThan(0);
  });
});

describe("connectionSortFn 接进真实的 TanStack 表格", () => {
  // 上面的用例用的是手造的行；这条确认 TanStack 真的会对组行调用 sortFn，
  // 并且降序时取反 —— 少了 `sortUndefined: false` 的话组行根本走不到 sortFn。
  //
  // 数据故意这样排：组 y 在原始顺序里排第一（排序没生效就会是 y 在前），组 x
  // 的第一条是「错的代表值」（只拿组里第一条来比也会是 y 在前）。
  function groupOrder(desc: boolean, xSpeeds: [number, number]) {
    const data = [
      entry({ id: "y", rule: "y", downloadSpeed: 100 }),
      entry({ id: "x1", rule: "x", downloadSpeed: xSpeeds[0] }),
      entry({ id: "x2", rule: "x", downloadSpeed: xSpeeds[1] }),
    ];
    const columns: LegacyColumnDef<ConnectionEntry>[] = [
      { id: "rule", accessorFn: (c) => c.rule },
      {
        id: "downloadSpeed",
        accessorFn: (c) => String(c.downloadSpeed),
        sortFn: connectionSortFn("downloadSpeed", desc),
        sortUndefined: false,
      },
    ];
    const { result } = renderHook(() =>
      useLegacyTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getGroupedRowModel: getGroupedRowModel(),
        getSortedRowModel: getSortedRowModel(),
        state: {
          grouping: ["rule"],
          sorting: [{ id: "downloadSpeed", desc }],
        },
      }),
    );
    return result.current.getRowModel().rows.map((r) => r.getValue("rule"));
  }

  it("降序：组 x 里有 500，排在只有 100 的组 y 前面", () => {
    expect(groupOrder(true, [1, 500])).toEqual(["x", "y"]);
  });

  it("升序：组 x 里有 1，同样排在前面", () => {
    expect(groupOrder(false, [500, 1])).toEqual(["x", "y"]);
  });
});

describe("useConnectionsStream", () => {
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
