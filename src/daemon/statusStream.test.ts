import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 一条 `SubscribeStatus` 同时喂流量和内存两个 store（审计项 M-06：以前是
 * 两条流订同一条消息）。这里用一条假流把 `onMessage` 走一遍，验的是分发和
 * 那个 0 值哨兵。
 */

// `vi.hoisted`：mock 工厂会被提升到 import 之前执行，普通的 `let` 那时还没
// 初始化。这个盒子跟着一起提升，控制器建立时把两个发射器塞进去。
const hooks = vi.hoisted(() => ({
  emit: (_status: Record<string, unknown>) => {},
  emitStatus: (_status: string) => {},
  started: 0,
  stopped: 0,
}));

vi.mock("./subscription", () => ({
  createStreamController: (options: {
    onMessage: (m: unknown) => void;
    onStatus: (s: string) => void;
  }) => {
    hooks.emit = (status) => options.onMessage(status);
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
vi.mock("./clients", () => ({
  startedService: { subscribeStatus: vi.fn() },
}));

import { useMemoryStore } from "../hooks/useMemoryStream";
import { useTrafficStore } from "../hooks/useTrafficStream";
import { startStatusStream, stopStatusStream } from "./statusStream";

function status(fields: Partial<Record<string, number | bigint>>) {
  return {
    downlink: 0n,
    uplink: 0n,
    downlinkTotal: 0n,
    uplinkTotal: 0n,
    memory: 0n,
    ...fields,
  };
}

beforeEach(() => {
  hooks.started = 0;
  hooks.stopped = 0;
  useTrafficStore.getState().clear();
  useMemoryStore.getState().clear();
});

describe("一条流两个 store", () => {
  it("速度和累计量分别落到流量 store 的不同字段", () => {
    hooks.emit(
      status({
        downlink: 1024n,
        uplink: 512n,
        downlinkTotal: 9_000n,
        uplinkTotal: 8_000n,
      }),
    );

    const traffic = useTrafficStore.getState();
    expect(traffic.downloadSpeed).toBe(1024);
    expect(traffic.uploadSpeed).toBe(512);
    // 累计量来自 daemon 自己维护的计数器，不是对活跃连接求和（M-07）。
    expect(traffic.downloadTotal).toBe(9_000);
    expect(traffic.uploadTotal).toBe(8_000);
  });

  it("同一条消息也喂内存 store", () => {
    hooks.emit(status({ memory: 12_345n }));
    expect(useMemoryStore.getState().inuse).toBe(12_345);
  });

  it("内存读数为 0 时保留上一次的值", () => {
    // 流刚（重）连时会有一两拍是 0。直接写进去，界面会从「已用 30 MB」跳成
    // 「已用 0 B」——真实占用不可能恰好为零，所以 0 当哨兵是安全的。
    hooks.emit(status({ memory: 30_000n }));
    hooks.emit(status({ memory: 0n }));
    expect(useMemoryStore.getState().inuse).toBe(30_000);
  });

  it("流量的 0 是真的 0 —— 没流量就是没流量", () => {
    hooks.emit(status({ downlink: 1024n, uplink: 1024n }));
    hooks.emit(status({ downlink: 0n, uplink: 0n }));
    expect(useTrafficStore.getState().downloadSpeed).toBe(0);
  });

  it("每一帧都进历史，并且不会无限长", () => {
    for (let i = 0; i < 80; i += 1) {
      hooks.emit(status({ downlink: BigInt(i) }));
    }
    const history = useTrafficStore.getState().history;
    expect(history.length).toBe(60);
    // 保留的是最近的那一段。
    expect(history[history.length - 1].dl).toBe(79);
  });

  it("流状态同时推给两个 store", () => {
    hooks.emitStatus("connected");
    expect(useTrafficStore.getState().streamStatus).toBe("connected");
    expect(useMemoryStore.getState().streamStatus).toBe("connected");

    hooks.emitStatus("error");
    expect(useTrafficStore.getState().streamStatus).toBe("error");
    expect(useMemoryStore.getState().streamStatus).toBe("error");
  });
});

describe("起停", () => {
  it("start 转给控制器", () => {
    startStatusStream();
    expect(hooks.started).toBe(1);
  });

  it("stop 默认保留数据 —— 切走页面不该把图表清空", () => {
    hooks.emit(status({ downlink: 1024n, memory: 30_000n }));
    stopStatusStream();

    expect(hooks.stopped).toBe(1);
    expect(useTrafficStore.getState().downloadSpeed).toBe(1024);
    expect(useMemoryStore.getState().inuse).toBe(30_000);
  });

  it("显式要求清理时两个 store 一起清", () => {
    hooks.emit(status({ downlink: 1024n, memory: 30_000n }));
    stopStatusStream(true);

    expect(useTrafficStore.getState().downloadSpeed).toBe(0);
    expect(useMemoryStore.getState().inuse).toBe(0);
  });
});
