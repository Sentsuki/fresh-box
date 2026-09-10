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
    // `stop` 必须真的调 `onStopped` —— 真的控制器就是这么做的，而
    // `stopConnectionsStream(true)` 的清理全在那个回调里。
    return { start: () => {}, stop: (onStopped?: () => void) => onStopped?.() };
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

import { stopConnectionsStream } from "./connectionsStream";

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
  // 走产品代码自己的清理路径，而不是只把替身 store 抹平：累加表常驻在
  // `connectionsStream` 模块里，只清 store 的话上一条测试的连接会漏到下一条。
  stopConnectionsStream(true);
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

  it("清空之后旧连接不会被下一帧带回来", () => {
    // 累加表常驻在模块里（避免每帧从数组重建一次 Map），所以「清空」必须同时
    // 清它和 store —— 只清 store 的话，下一帧算出来的整表里还带着停止之前
    // 那批连接。
    hooks.emit(frame([newEvent("a"), newEvent("b")]));
    expect(store.active).toHaveLength(2);

    stopConnectionsStream(true);
    expect(store.active).toHaveLength(0);

    hooks.emit(frame([newEvent("c")]));
    expect(store.active.map((c) => c.id)).toEqual(["c"]);
  });

  it("推给 store 的已关闭列表是快照，不是还会变的那份", () => {
    // 就地截断/`unshift` 的是模块里那份；直接把它递给 store 等于让 React
    // 拿到一个背着它变的数组。
    hooks.emit(frame([newEvent("a"), closedEvent("a")]));
    const first = store.closed;
    expect(first).toHaveLength(1);

    hooks.emit(frame([newEvent("b"), closedEvent("b")]));
    expect(first).toHaveLength(1);
    expect(store.closed).toHaveLength(2);
    expect(store.closed).not.toBe(first);
  });

  it("流状态透传给 store", () => {
    hooks.emitStatus("connected");
    expect(store.streamStatus).toBe("connected");
  });
});
