import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  GroupItemSchema,
  GroupSchema,
  type Group,
} from "../gen/daemon/started_service_pb";

/**
 * 测速的等待逻辑 —— 这是 M-08 的修复所在。
 *
 * 两条不变量：**先记基线再触发**（反过来的话结果可能在记基线之前就到了，于是
 * 永远等不到「变化」），以及**结果齐了就返回**（旧实现只在超时或流结束时退出，
 * 所以不管节点多快，组测速固定卡满 5 秒）。
 */

const urlTest = vi.fn(async () => ({}));
const closeConnection = vi.fn(async () => ({}));

vi.mock("./clients", () => ({
  startedService: {
    uRLTest: (...args: unknown[]) => urlTest(...(args as [])),
    closeConnection: (...args: unknown[]) => closeConnection(...(args as [])),
  },
}));

// `groupsStream.ts` 顶层就要建订阅，这里只需要它的两个读取面。
let groups: Group[] = [];
const listeners = new Set<(g: Group[]) => void>();
vi.mock("./groupsStream", () => ({
  currentGroups: () => groups,
  onGroupsChanged: (listener: (g: Group[]) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const active: { id: string; chains: string[] }[] = [];
vi.mock("../hooks/useConnectionsStream", () => ({
  useConnectionsStore: { getState: () => ({ active }) },
}));

import {
  awaitGroupDelays,
  awaitNodeDelay,
  closeConnectionsByGroup,
} from "./proxyActions";

/** 换一份组快照并通知订阅者 —— 模拟 `SubscribeGroups` 推来一帧。 */
function publish(next: Group[]) {
  groups = next;
  for (const listener of [...listeners]) listener(groups);
}

function group(items: { tag: string; time: bigint; delay: number }[]): Group {
  return create(GroupSchema, {
    tag: "manual",
    selectable: true,
    items: items.map((item) =>
      create(GroupItemSchema, {
        tag: item.tag,
        urlTestTime: item.time,
        urlTestDelay: item.delay,
      }),
    ),
  });
}

beforeEach(() => {
  urlTest.mockClear();
  closeConnection.mockClear();
  listeners.clear();
  groups = [];
  active.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("awaitNodeDelay", () => {
  it("触发测速，然后等这个节点的 urlTestTime 变化", async () => {
    publish([group([{ tag: "a", time: 100n, delay: 50 }])]);
    const pending = awaitNodeDelay("a");
    await Promise.resolve();

    expect(urlTest).toHaveBeenCalledWith({ outboundTag: "a" });
    publish([group([{ tag: "a", time: 200n, delay: 123 }])]);

    await expect(pending).resolves.toBe(123);
  });

  it("判定依据是时间戳而不是延迟值", async () => {
    // 两次测速完全可能得到同一个延迟。只看 `urlTestDelay` 的话，重测一个
    // 稳定的节点会永远等到超时。
    publish([group([{ tag: "a", time: 100n, delay: 50 }])]);
    const pending = awaitNodeDelay("a");
    await Promise.resolve();

    publish([group([{ tag: "a", time: 200n, delay: 50 }])]);
    await expect(pending).resolves.toBe(50);
  });

  it("没变化就一直等到超时", async () => {
    vi.useFakeTimers();
    publish([group([{ tag: "a", time: 100n, delay: 50 }])]);
    const pending = awaitNodeDelay("a");
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);

    // 同一帧再推一次，时间戳没动 —— 不算新结果。
    publish([group([{ tag: "a", time: 100n, delay: 50 }])]);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await settled).toBeInstanceOf(Error);
  });

  it("触发调用本身失败就直接抛，不用等满超时", async () => {
    urlTest.mockRejectedValueOnce(new Error("instance not running"));
    publish([group([{ tag: "a", time: 100n, delay: 50 }])]);
    await expect(awaitNodeDelay("a")).rejects.toThrow("instance not running");
  });
});

describe("awaitGroupDelays", () => {
  it("结果齐了立刻返回，不等超时", async () => {
    vi.useFakeTimers();
    publish([
      group([
        { tag: "a", time: 100n, delay: 10 },
        { tag: "b", time: 100n, delay: 20 },
      ]),
    ]);
    const pending = awaitGroupDelays("manual", ["a", "b"]);
    await vi.advanceTimersByTimeAsync(0);

    publish([
      group([
        { tag: "a", time: 200n, delay: 11 },
        { tag: "b", time: 200n, delay: 22 },
      ]),
    ]);

    // 一格时间都不用推进 —— 齐了就该 resolve。
    await expect(pending).resolves.toEqual({ a: 11, b: 22 });
  });

  it("分两帧到齐也算齐", async () => {
    publish([
      group([
        { tag: "a", time: 100n, delay: 10 },
        { tag: "b", time: 100n, delay: 20 },
      ]),
    ]);
    const pending = awaitGroupDelays("manual", ["a", "b"]);
    await Promise.resolve();

    publish([
      group([
        { tag: "a", time: 200n, delay: 11 },
        { tag: "b", time: 100n, delay: 20 },
      ]),
    ]);
    publish([
      group([
        { tag: "a", time: 200n, delay: 11 },
        { tag: "b", time: 300n, delay: 22 },
      ]),
    ]);

    await expect(pending).resolves.toEqual({ a: 11, b: 22 });
  });

  it("超时不算失败 —— 已经拿到的结果照样交回去", async () => {
    // 整组里有一两个节点不可达是常态，不该让整次操作报错。
    vi.useFakeTimers();
    publish([
      group([
        { tag: "a", time: 100n, delay: 10 },
        { tag: "unreachable", time: 100n, delay: 0 },
      ]),
    ]);
    const pending = awaitGroupDelays("manual", ["a", "unreachable"]);
    await vi.advanceTimersByTimeAsync(0);

    publish([
      group([
        { tag: "a", time: 200n, delay: 11 },
        { tag: "unreachable", time: 100n, delay: 0 },
      ]),
    ]);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toEqual({ a: 11 });
  });

  it("触发的是整组的 tag，不是逐个节点", async () => {
    publish([group([{ tag: "a", time: 100n, delay: 10 }])]);
    const pending = awaitGroupDelays("manual", ["a"]);
    await Promise.resolve();
    expect(urlTest).toHaveBeenCalledTimes(1);
    expect(urlTest).toHaveBeenCalledWith({ outboundTag: "manual" });

    publish([group([{ tag: "a", time: 200n, delay: 11 }])]);
    await pending;
  });
});

describe("closeConnectionsByGroup", () => {
  it("只关链路里经过这个组的连接", async () => {
    active.push(
      { id: "1", chains: ["manual", "proxy-a"] },
      { id: "2", chains: ["other"] },
      { id: "3", chains: ["manual"] },
    );

    await closeConnectionsByGroup("manual");

    expect(closeConnection).toHaveBeenCalledTimes(2);
    expect(closeConnection).toHaveBeenCalledWith({ id: "1" });
    expect(closeConnection).toHaveBeenCalledWith({ id: "3" });
  });

  it("某一条关不掉不影响其它的", async () => {
    // `Promise.allSettled`：连接可能在我们发请求的同时自己断了，那不是错误。
    active.push(
      { id: "1", chains: ["manual"] },
      { id: "2", chains: ["manual"] },
    );
    closeConnection.mockRejectedValueOnce(new Error("already closed"));

    await expect(closeConnectionsByGroup("manual")).resolves.toBeUndefined();
    expect(closeConnection).toHaveBeenCalledTimes(2);
  });

  it("没有匹配的连接时一次调用都不发", async () => {
    active.push({ id: "1", chains: ["other"] });
    await closeConnectionsByGroup("manual");
    expect(closeConnection).not.toHaveBeenCalled();
  });
});
