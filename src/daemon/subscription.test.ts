import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSingboxStore } from "../stores/singboxStore";
import { createStreamController, type StreamStatus } from "./subscription";

/**
 * 流控制器的状态机 —— 原来是 Rust 的 `services::streams::run_with_reconnect`。
 *
 * 值得测的是那条最容易写错的分支：流结束**不一定**是错误。sing-box 正常停止
 * 时所有订阅都会结束，要是一律当成 error，用户每次手动停止都会看到一排红色的
 * 「连接错误」，而且还会进 1.5 秒一次的重连循环。
 */

/** 一条能被测试逐条喂数据、并按要求结束或抛错的假订阅。 */
function fakeStream<T>() {
  const queue: T[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  let failure: Error | null = null;

  const bump = () => {
    wake?.();
    wake = null;
  };

  return {
    push(value: T) {
      queue.push(value);
      bump();
    },
    /** 流自己结束 —— 对应 sing-box 停了、或者 daemon 关掉了这条订阅。 */
    end() {
      done = true;
      bump();
    },
    fail(message: string) {
      failure = new Error(message);
      bump();
    },
    async *iterate(signal: AbortSignal): AsyncIterable<T> {
      for (;;) {
        if (signal.aborted) return;
        if (failure) throw failure;
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (done) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      }
    },
  };
}

/** 让挂起的 promise 有机会跑完 —— 控制器内部全是 await。 */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setRunning(running: boolean) {
  useSingboxStore.getState().setRunning(running);
}

describe("createStreamController", () => {
  let statuses: StreamStatus[];

  beforeEach(() => {
    statuses = [];
    setRunning(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function build<T>(stream: ReturnType<typeof fakeStream<T>>) {
    const messages: T[] = [];
    const controller = createStreamController<T>({
      subscribe: (signal) => stream.iterate(signal),
      onMessage: (message) => messages.push(message),
      onStatus: (status) => statuses.push(status),
    });
    return { controller, messages };
  }

  it("sing-box 没在跑时安静地等，不去建订阅", async () => {
    const stream = fakeStream<number>();
    const subscribe = vi.fn((signal: AbortSignal) => stream.iterate(signal));
    const controller = createStreamController({
      subscribe,
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    controller.start();
    await settle();

    expect(subscribe).not.toHaveBeenCalled();
    expect(statuses).toEqual(["connecting"]);
    controller.stop();
  });

  it("sing-box 起来之后自动建订阅并投递消息", async () => {
    const stream = fakeStream<number>();
    const { controller, messages } = build(stream);

    controller.start();
    await settle();
    setRunning(true);
    await settle();

    stream.push(1);
    stream.push(2);
    await settle();

    expect(messages).toEqual([1, 2]);
    expect(statuses).toEqual(["connecting", "connected"]);
    controller.stop();
  });

  it("sing-box 停止导致流结束不算错误", async () => {
    // 这就是那条分支：回到 connecting 等它再起来，不报 error、不进重连循环。
    const stream = fakeStream<number>();
    const { controller } = build(stream);

    controller.start();
    setRunning(true);
    await settle();

    setRunning(false);
    stream.end();
    await settle();

    expect(statuses).not.toContain("error");
    expect(statuses[statuses.length - 1]).toBe("connecting");
    controller.stop();
  });

  it("sing-box 还在跑时流断了才算错误，并且退避后重订阅", async () => {
    vi.useFakeTimers();
    const first = fakeStream<number>();
    const second = fakeStream<number>();
    const streams = [first, second];
    const subscribe = vi.fn((signal: AbortSignal) =>
      (streams.shift() ?? second).iterate(signal),
    );
    const controller = createStreamController({
      subscribe,
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    controller.start();
    setRunning(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscribe).toHaveBeenCalledTimes(1);

    first.fail("pipe broke");
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toContain("error");
    // 立刻重订阅会变成出错即重连的紧循环，所以要先等一会儿。
    expect(subscribe).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(subscribe).toHaveBeenCalledTimes(2);

    controller.stop();
  });

  it("stop 之后不再重订阅，并落到 disconnected", async () => {
    const stream = fakeStream<number>();
    const { controller } = build(stream);

    controller.start();
    setRunning(true);
    await settle();

    controller.stop();
    await settle();

    expect(statuses[statuses.length - 1]).toBe("disconnected");
  });

  it("stop 会把清理回调也执行掉", () => {
    const stream = fakeStream<number>();
    const { controller } = build(stream);
    const onStopped = vi.fn();

    controller.start();
    controller.stop(onStopped);

    expect(onStopped).toHaveBeenCalledOnce();
  });

  it("start 是幂等的，不会开出两条订阅", async () => {
    const stream = fakeStream<number>();
    const subscribe = vi.fn((signal: AbortSignal) => stream.iterate(signal));
    const controller = createStreamController({
      subscribe,
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    setRunning(true);
    controller.start();
    controller.start();
    await settle();

    expect(subscribe).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it("stop 之后还能再 start", async () => {
    const stream = fakeStream<number>();
    const subscribe = vi.fn((signal: AbortSignal) => stream.iterate(signal));
    const controller = createStreamController({
      subscribe,
      onMessage: () => {},
      onStatus: (status) => statuses.push(status),
    });

    setRunning(true);
    controller.start();
    await settle();
    controller.stop();
    await settle();
    controller.start();
    await settle();

    expect(subscribe).toHaveBeenCalledTimes(2);
    controller.stop();
  });
});
