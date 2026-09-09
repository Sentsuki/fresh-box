import { describe, expect, it, vi, beforeEach } from "vitest";
import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";

// 必须在 import 被测模块之前 —— `transport.ts` 在模块顶层就把 `invoke` 和
// `Channel` 绑好了。stub 的 `Channel` 只是一个装 `onmessage` 的盒子：真的那个
// 会去连 `__TAURI_INTERNALS__`，而在 node 里根本没有。
vi.mock("@tauri-apps/api/core", () => {
  class Channel<T> {
    onmessage: (message: T) => void = () => {};
  }
  return { Channel, invoke: vi.fn() };
});

import { invoke } from "@tauri-apps/api/core";
import {
  ClashModeStatusSchema,
  LogSchema,
  StartedService,
} from "../gen/daemon/started_service_pb";
import { createTauriTransport } from "./transport";

const invokeMock = vi.mocked(invoke);

const FRAME_MESSAGE = 0x00;
const FRAME_END = 0x01;
const FRAME_ERROR = 0x02;

/** 一个流帧：一字节标签 + 载荷，和 Rust 的 `daemon::bridge::frame` 一致。 */
function frame(
  tag: number,
  payload: Uint8Array = new Uint8Array(),
): ArrayBuffer {
  const bytes = new Uint8Array(payload.length + 1);
  bytes[0] = tag;
  bytes.set(payload, 1);
  return bytes.buffer;
}

function logFrame(message: string): ArrayBuffer {
  return frame(
    FRAME_MESSAGE,
    toBinary(LogSchema, create(LogSchema, { messages: [{ message }] })),
  );
}

function errorFrame(message: string): ArrayBuffer {
  return frame(FRAME_ERROR, new TextEncoder().encode(message));
}

async function* noRequest() {
  yield {};
}

/**
 * 建流：`daemon_stream` 一被调用就把 `onEvent` channel 抓出来交给测试驱动。
 * 返回的 `emit` 扮演的就是 Rust 侧 `Channel::send` 的角色。
 */
function captureChannel(streamId = 7) {
  let sink!: { onmessage: (frame: ArrayBuffer) => void };
  invokeMock.mockImplementation(async (command, args) => {
    if (command === "daemon_stream") {
      sink = (args as { onEvent: typeof sink }).onEvent;
      return streamId;
    }
    return undefined;
  });
  return { emit: (f: ArrayBuffer) => sink.onmessage(f) };
}

async function collect(
  messages: AsyncIterable<{ messages: { message: string }[] }>,
) {
  const out: string[] = [];
  for await (const log of messages) out.push(log.messages[0]?.message ?? "");
  return out;
}

describe("unary", () => {
  beforeEach(() => invokeMock.mockReset());

  it("过界的只有 service 名、method 名和一坨字节", async () => {
    // 这条断言就是「Rust 是邮差不是翻译」的可执行版本：请求里除了这三样
    // 什么都没有，Rust 不需要知道这次调的是哪个消息类型。
    const response = toBinary(
      ClashModeStatusSchema,
      create(ClashModeStatusSchema, {
        modeList: ["rule", "global"],
        currentMode: "rule",
      }),
    );
    invokeMock.mockResolvedValue(response.buffer);

    const result = await createTauriTransport().unary(
      StartedService.method.getClashModeStatus,
      undefined,
      undefined,
      undefined,
      {},
      undefined,
    );

    expect(invokeMock).toHaveBeenCalledWith("daemon_unary", {
      service: "daemon.StartedService",
      method: "GetClashModeStatus",
      request: [],
    });
    expect(result.message.currentMode).toBe("rule");
    expect(result.message.modeList).toEqual(["rule", "global"]);
  });

  it("Rust 侧的失败变成 ConnectError，而不是一个裸对象", async () => {
    // 同步 throw 而不是返回一个已 reject 的 promise —— vi.fn 会给返回的
    // promise 挂上自己的结算追踪，那条派生 promise 没人处理，会被 node 当成
    // unhandled rejection 报上来，把测试搞成红的。被测代码 `await` 它，两种
    // 写法效果一样。
    invokeMock.mockImplementation(() => {
      throw { kind: "daemon_unavailable", message: "pipe is gone" };
    });

    let thrown: unknown;
    try {
      await createTauriTransport().unary(
        StartedService.method.getClashModeStatus,
        undefined,
        undefined,
        undefined,
        {},
        undefined,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConnectError);
    expect(ConnectError.from(thrown).code).toBe(Code.Unavailable);
    // 原始 rejection 仍在 `cause` 链上，排障时不至于只剩一句 unavailable。
    expect(ConnectError.from(thrown).rawMessage).toBe("pipe is gone");
  });

  it("已经取消的调用根本不出门", async () => {
    await expect(
      createTauriTransport().unary(
        StartedService.method.getClashModeStatus,
        AbortSignal.abort(),
        undefined,
        undefined,
        {},
        undefined,
      ),
    ).rejects.toThrow();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("server streaming", () => {
  beforeEach(() => invokeMock.mockReset());

  it("剥掉标签之后就是 daemon 原样发出的 protobuf", async () => {
    const channel = captureChannel();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      undefined,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(logFrame("first"));
    channel.emit(logFrame("second"));
    channel.emit(frame(FRAME_END));

    expect(await collect(stream.message)).toEqual(["first", "second"]);
  });

  it("空载荷的消息不会被当成流结束", async () => {
    // 全字段取默认值的 protobuf 消息编码后是零字节 —— 帧里就只剩那一个标签。
    // 这是 Rust 侧 `BytesDecoder` 那个坑的前端对偶。
    const channel = captureChannel();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      undefined,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(frame(FRAME_MESSAGE));
    channel.emit(logFrame("after the empty one"));
    channel.emit(frame(FRAME_END));

    expect(await collect(stream.message)).toEqual(["", "after the empty one"]);
  });

  it("流中途出错时，已经到手的消息不会被丢掉", async () => {
    // `WritableIterable.close()` 收不了错误，所以 transport 把错误存起来，等
    // 消费者读完队列里的消息再抛。要是写成「一出错就直接 throw」，用户就会
    // 丢掉断流前那几条日志 —— 恰恰是最想看的那几条。
    const channel = captureChannel();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      undefined,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(logFrame("before the break"));
    channel.emit(errorFrame("instance stopped"));

    const seen: string[] = [];
    let thrown: unknown;
    try {
      for await (const log of stream.message) {
        seen.push(log.messages[0]?.message ?? "");
      }
    } catch (error) {
      thrown = error;
    }

    expect(seen).toEqual(["before the break"]);
    expect(thrown).toBeInstanceOf(ConnectError);
    expect(ConnectError.from(thrown).rawMessage).toBe("instance stopped");
  });

  it("认不出的帧标签是内部错误，不是静默丢弃", async () => {
    const channel = captureChannel();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      undefined,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(frame(0x7f));

    await expect(collect(stream.message)).rejects.toMatchObject({
      code: Code.Internal,
    });
  });

  it("结束之后到的帧被忽略，不会往已关闭的队列里写", async () => {
    const channel = captureChannel();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      undefined,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(logFrame("only"));
    channel.emit(frame(FRAME_END));
    channel.emit(logFrame("too late"));
    channel.emit(errorFrame("too late as well"));

    expect(await collect(stream.message)).toEqual(["only"]);
  });

  it("取消会把流 id 还给 Rust", async () => {
    // 不还的话 `StreamRegistry` 里的任务要挂到窗口销毁才被回收 —— 切页面
    // 切几次就攒下一把没人读的订阅。
    const channel = captureChannel(42);
    const controller = new AbortController();
    const stream = await createTauriTransport().stream(
      StartedService.method.subscribeLog,
      controller.signal,
      undefined,
      undefined,
      noRequest(),
      undefined,
    );

    channel.emit(logFrame("one"));
    controller.abort();

    expect(invokeMock).toHaveBeenCalledWith("daemon_cancel", { id: 42 });
    // 取消是「就此打住」，不是「报错」—— 已收到的消息照常读完，然后干净结束。
    expect(await collect(stream.message)).toEqual(["one"]);
  });

  it("建流本身失败时抛出，而不是给一个立刻结束的空流", async () => {
    invokeMock.mockImplementation(() => {
      throw "method not allowed";
    });

    let thrown: unknown;
    try {
      await createTauriTransport().stream(
        StartedService.method.subscribeLog,
        undefined,
        undefined,
        undefined,
        noRequest(),
        undefined,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConnectError);
    expect(ConnectError.from(thrown).rawMessage).toBe("method not allowed");
  });
});
