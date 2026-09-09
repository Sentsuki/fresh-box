import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";

import {
  ConnectionEventSchema,
  ConnectionEventType,
  ConnectionSchema,
  type Connection,
} from "../gen/daemon/started_service_pb";
import type { ConnectionEntry } from "../types/app";
import { applyEvent, splitHostPort } from "./connectionEntries";

describe("splitHostPort", () => {
  it("拆开普通的 host:port", () => {
    expect(splitHostPort("192.168.1.1:443")).toEqual(["192.168.1.1", "443"]);
  });

  it("IPv6 的方括号形式不会被里面的冒号骗到", () => {
    expect(splitHostPort("[2001:db8::1]:8080")).toEqual([
      "2001:db8::1",
      "8080",
    ]);
    // 没有端口的方括号形式：主机名留下，端口是空串。
    expect(splitHostPort("[::1]")).toEqual(["::1", ""]);
  });

  it("裸 IPv6（daemon 偶尔就是这么给的）取最后一个冒号", () => {
    // 这是不完美但故意的：`fe80::1` 这种没有端口的裸 IPv6 会被拆坏。上游
    // `Connection.source` 一律带端口，真拆坏了也只影响表格里的一列显示。
    expect(splitHostPort("fe80::1:53")).toEqual(["fe80::1", "53"]);
  });

  it("没有冒号就整串当主机", () => {
    expect(splitHostPort("localhost")).toEqual(["localhost", ""]);
    expect(splitHostPort("")).toEqual(["", ""]);
  });
});

/** 取一条必须存在的活跃连接 —— 比 `!` 断言在失败时说得清楚。 */
function activeEntry(
  active: Map<string, ConnectionEntry>,
  id: string,
): ConnectionEntry {
  const entry = active.get(id);
  if (!entry) throw new Error(`no active connection ${id}`);
  return entry;
}

function newEvent(id: string, fields: Record<string, unknown> = {}) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_NEW,
    id,
    connection: create(ConnectionSchema, {
      id,
      source: "127.0.0.1:5000",
      destination: "1.1.1.1:443",
      network: "tcp",
      ...fields,
    }),
  });
}

function updateEvent(id: string, uplink: bigint, downlink: bigint) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_UPDATE,
    id,
    uplinkDelta: uplink,
    downlinkDelta: downlink,
  });
}

function closedEvent(id: string, connection?: Connection) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_CLOSED,
    id,
    ...(connection ? { connection } : {}),
  });
}

describe("applyEvent", () => {
  it("NEW 建条目，UPDATE 在它上面累加", () => {
    // 这就是从 Rust 搬过来的那份累加：daemon 每秒只送增量，总量是这里攒的。
    const active = new Map<string, ConnectionEntry>();
    const closed: ConnectionEntry[] = [];

    applyEvent(active, closed, newEvent("a"));
    applyEvent(active, closed, updateEvent("a", 100n, 200n));
    applyEvent(active, closed, updateEvent("a", 50n, 60n));

    const entry = activeEntry(active, "a");
    expect(entry.upload).toBe(150);
    expect(entry.download).toBe(260);
    // 速度是**本帧**的增量，不是累计 —— 表格那一列显示的是 B/s。
    expect(entry.uploadSpeed).toBe(50);
    expect(entry.downloadSpeed).toBe(60);
  });

  it("UPDATE 没有 connection 载荷也照样生效", () => {
    // 上游 `buildTrafficUpdates` 只在 NEW 时填 `connection`。Rust 那版一度
    // 写成「没有 connection 就 return」，于是每条增量都被丢掉，速度恒为 0。
    const active = new Map<string, ConnectionEntry>();
    applyEvent(active, [], newEvent("a"));
    const event = updateEvent("a", 10n, 20n);
    expect(event.connection).toBeUndefined();

    applyEvent(active, [], event);
    expect(activeEntry(active, "a").download).toBe(20);
  });

  it("流量停下来的那一帧把速度归零", () => {
    // 增量为 0 的 UPDATE 是上游明确会送的（「刚停止流量的连接」），没有它
    // 速度就会一直停在最后一个非零值上。
    const active = new Map<string, ConnectionEntry>();
    applyEvent(active, [], newEvent("a"));
    applyEvent(active, [], updateEvent("a", 100n, 100n));
    applyEvent(active, [], updateEvent("a", 0n, 0n));

    const entry = activeEntry(active, "a");
    expect(entry.uploadSpeed).toBe(0);
    expect(entry.downloadSpeed).toBe(0);
    // 归零的是速度，不是累计量。
    expect(entry.upload).toBe(100);
  });

  it("认不出 id 的 UPDATE 被忽略，不会凭空造一条连接", () => {
    const active = new Map<string, ConnectionEntry>();
    applyEvent(active, [], updateEvent("ghost", 1n, 1n));
    expect(active.size).toBe(0);
  });

  it("CLOSED 用事件自带的最终快照，而不是最后一帧的活跃状态", () => {
    // L-17：这份最终统计和 `closedAt` 以前被 Rust 直接丢掉，「已关闭」标签页
    // 只能显示最后一次看到的活跃快照。
    const active = new Map<string, ConnectionEntry>();
    const closed: ConnectionEntry[] = [];
    applyEvent(active, closed, newEvent("a"));
    applyEvent(active, closed, updateEvent("a", 10n, 10n));

    const final = create(ConnectionSchema, {
      id: "a",
      source: "127.0.0.1:5000",
      destination: "1.1.1.1:443",
      uplinkTotal: 999n,
      downlinkTotal: 888n,
      closedAt: 1700000000000n,
    });
    applyEvent(active, closed, closedEvent("a", final));

    expect(active.size).toBe(0);
    expect(closed).toHaveLength(1);
    expect(closed[0].upload).toBe(999);
    expect(closed[0].download).toBe(888);
    expect(closed[0].closedAt).toBe(new Date(1700000000000).toISOString());
  });

  it("CLOSED 没带快照时退回到最后已知的那一条", () => {
    const active = new Map<string, ConnectionEntry>();
    const closed: ConnectionEntry[] = [];
    applyEvent(active, closed, newEvent("a"));
    applyEvent(active, closed, updateEvent("a", 7n, 7n));
    applyEvent(active, closed, closedEvent("a"));

    expect(closed).toHaveLength(1);
    expect(closed[0].upload).toBe(7);
    // 已经关掉的连接速度必须归零，否则「已关闭」页上会挂着一个永不衰减的速率。
    expect(closed[0].uploadSpeed).toBe(0);
    expect(closed[0].downloadSpeed).toBe(0);
  });

  it("从没见过的连接直接 CLOSED 不会留下空条目", () => {
    // 订阅刚建立时会收到一批「上一轮就已经关掉」的事件。
    const closed: ConnectionEntry[] = [];
    applyEvent(new Map(), closed, closedEvent("never-seen"));
    expect(closed).toHaveLength(0);
  });

  it("最近关闭的排在最前", () => {
    const active = new Map<string, ConnectionEntry>();
    const closed: ConnectionEntry[] = [];
    applyEvent(active, closed, newEvent("first"));
    applyEvent(active, closed, newEvent("second"));
    applyEvent(active, closed, closedEvent("first"));
    applyEvent(active, closed, closedEvent("second"));

    expect(closed.map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("域名优先于目标 IP 显示，两者都在条目里", () => {
    const active = new Map<string, ConnectionEntry>();
    applyEvent(
      active,
      [],
      newEvent("a", {
        domain: "example.com",
        processInfo: { processPath: "C:\\Program Files\\app\\thing.exe" },
      }),
    );

    const entry = activeEntry(active, "a");
    expect(entry.metadata.host).toBe("example.com");
    expect(entry.metadata.destinationIP).toBe("1.1.1.1");
    // 进程名从路径尾巴上取，Windows 的反斜杠也要认。
    expect(entry.metadata.process).toBe("thing.exe");
  });

  it("没有域名时退回目标 IP", () => {
    const active = new Map<string, ConnectionEntry>();
    applyEvent(active, [], newEvent("a"));
    expect(activeEntry(active, "a").metadata.host).toBe("1.1.1.1");
    expect(activeEntry(active, "a").metadata.process).toBeUndefined();
  });
});
