import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  ConnectionEventSchema,
  ConnectionEventType,
  ConnectionEventsSchema,
  ConnectionSchema,
  type ConnectionEvents,
} from "../gen/daemon/started_service_pb";
import type { ConnectionEntry } from "../types/app";

/**
 * 连接流的帧处理：累加、封顶、暂停、reset。
 *
 * 逐条事件的语义在 `connectionEntries.test.ts` 里测过了，这里测的是外面那一层
 * —— 每收到一帧要做的整表操作。
 */

const hooks = vi.hoisted(() => ({
  emit: (_frame: unknown) => {},
  emitStatus: (_status: string) => {},
}));

vi.mock("./subscription", () => ({
  createStreamController: (options: {
    onMessage: (m: unknown) => void;
    onStatus: (s: string) => void;
  }) => {
    hooks.emit = (frame) => options.onMessage(frame);
    hooks.emitStatus = (s) => options.onStatus(s);
    return { start: () => {}, stop: () => {} };
  },
}));
vi.mock("./clients", () => ({
  startedService: { subscribeConnections: () => undefined },
}));

// 连接 store 的最小替身 —— 真的那个会拉进 Fluent UI。
const store = {
  active: [] as ConnectionEntry[],
  closed: [] as ConnectionEntry[],
  isPaused: false,
  totalDownloadSpeed: 0,
  totalUploadSpeed: 0,
  streamStatus: "disconnected",
};
vi.mock("../hooks/useConnectionsStream", () => ({
  useConnectionsStore: {
    getState: () => ({
      ...store,
      setFrame: (frame: {
        connections: ConnectionEntry[];
        closed: ConnectionEntry[];
        totalDownloadSpeed: number;
        totalUploadSpeed: number;
      }) => {
        store.active = frame.connections;
        store.closed = frame.closed;
        store.totalDownloadSpeed = frame.totalDownloadSpeed;
        store.totalUploadSpeed = frame.totalUploadSpeed;
      },
      setStreamStatus: (status: string) => {
        store.streamStatus = status;
      },
      clear: () => {
        store.active = [];
        store.closed = [];
      },
    }),
  },
}));

import "./connectionsStream";

function newEvent(id: string) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_NEW,
    id,
    connection: create(ConnectionSchema, {
      id,
      source: "127.0.0.1:5000",
      destination: "1.1.1.1:443",
    }),
  });
}

function updateEvent(id: string, up: bigint, down: bigint) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_UPDATE,
    id,
    uplinkDelta: up,
    downlinkDelta: down,
  });
}

function closedEvent(id: string) {
  return create(ConnectionEventSchema, {
    type: ConnectionEventType.CONNECTION_EVENT_CLOSED,
    id,
  });
}

function frame(
  events: ReturnType<typeof newEvent>[],
  reset = false,
): ConnectionEvents {
  return create(ConnectionEventsSchema, { events, reset });
}

beforeEach(() => {
  store.active = [];
  store.closed = [];
  store.isPaused = false;
  store.totalDownloadSpeed = 0;
  store.totalUploadSpeed = 0;
});

describe("每一帧", () => {
  it("跨帧累加 —— 上一帧的结果是下一帧的起点", () => {
    hooks.emit(frame([newEvent("a")]));
    hooks.emit(frame([updateEvent("a", 100n, 200n)]));
    hooks.emit(frame([updateEvent("a", 50n, 60n)]));

    expect(store.active).toHaveLength(1);
    expect(store.active[0].upload).toBe(150);
    expect(store.active[0].download).toBe(260);
  });

  it("总速度是本帧全部活跃连接的和", () => {
    hooks.emit(frame([newEvent("a"), newEvent("b")]));
    hooks.emit(frame([updateEvent("a", 10n, 20n), updateEvent("b", 30n, 40n)]));

    expect(store.totalUploadSpeed).toBe(40);
    expect(store.totalDownloadSpeed).toBe(60);
  });

  it("reset 帧丢掉活跃表，但保留已关闭的历史", () => {
    // daemon 重新开始推送（实例重启）时会带 reset。活跃连接肯定都没了，
    // 但用户之前看到的「已关闭」列表不该跟着消失。
    hooks.emit(frame([newEvent("a")]));
    hooks.emit(frame([closedEvent("a")]));
    hooks.emit(frame([newEvent("b")]));
    expect(store.active).toHaveLength(1);
    expect(store.closed).toHaveLength(1);

    hooks.emit(frame([newEvent("c")], true));

    expect(store.active.map((c) => c.id)).toEqual(["c"]);
    expect(store.closed).toHaveLength(1);
  });

  it("暂停时整帧不处理", () => {
    hooks.emit(frame([newEvent("a")]));
    store.isPaused = true;
    hooks.emit(frame([newEvent("b")]));

    expect(store.active.map((c) => c.id)).toEqual(["a"]);
  });

  it("已关闭列表有上限", () => {
    // 长时间挂着的话这个列表会无限长 —— 1000 条之外的截掉。
    for (let i = 0; i < 1100; i += 1) {
      hooks.emit(frame([newEvent(`c${i}`), closedEvent(`c${i}`)]));
    }
    expect(store.closed).toHaveLength(1000);
    // 留下的是最近的。
    expect(store.closed[0].id).toBe("c1099");
  });

  it("流状态透传给 store", () => {
    hooks.emitStatus("connected");
    expect(store.streamStatus).toBe("connected");
  });
});
