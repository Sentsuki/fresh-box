import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { DescMessage, MessageInitShape } from "@bufbuild/protobuf";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Transport } from "@connectrpc/connect";
import { createWritableIterable } from "@connectrpc/connect/protocol";

import { invokeRaw } from "../services/tauri";

/**
 * 流帧的一字节标签，必须和 Rust 侧 `daemon::bridge::frame` 保持一致。
 *
 * `Channel` 只能送裸字节，没有地方放「消息 / 结束 / 出错」这类控制信息，所以
 * 在载荷前面加一个字节。这是传输分帧，不是改载荷 —— 剥掉标签之后就是 daemon
 * 原样发出的那串 protobuf 字节。
 */
const FRAME_MESSAGE = 0x00;
const FRAME_END = 0x01;
const FRAME_ERROR = 0x02;

/**
 * 把 connect-rpc 的 `Transport` 接口实现在 Tauri IPC 之上。
 *
 * 这是「Rust 从翻译变成邮差」的前端一半：调用方拿到的是从 `.proto` 生成的、
 * 全类型化的 stub（`createClient(DesktopService, transport)`），而实际过界的
 * 只有 service 名、method 名和一坨 protobuf 字节。Rust 侧的
 * `daemon_unary` 不解析其中任何内容。
 *
 * 对照官方客户端的 `src/renderer/src/transport.ts` —— 同样的形状，只是它跑在
 * Electron 的 ipcRenderer 上，这里跑在 Tauri 的 invoke 上。
 *
 * 阶段 0 只实现 `unary`。`stream` 要等阶段 2 的 `daemon_stream` +
 * `StreamRegistry`（按窗口回收）落地 —— 在那之前显式抛错，而不是留一个
 * 会在运行时莫名卡住的空实现。
 */
export function createTauriTransport(): Transport {
  return {
    async unary(method, signal, _timeoutMs, _header, input, _contextValues) {
      signal?.throwIfAborted();

      const request = toBinary(method.input, create(method.input, input));

      let response: ArrayBuffer;
      try {
        response = await invokeRaw("daemon_unary", {
          service: method.parent.typeName,
          method: method.name,
          // Tauri 的命令参数走 JSON，所以这里是数字数组。一元请求都很小
          // （`GetDaemonInfo` 是 Empty，0 字节），阶段 0 不值得为它引入裸
          // body 形式；真正在意吞吐的是阶段 2 的流式通道。
          request: Array.from(request),
        });
      } catch (error) {
        // Rust 侧的 CommandError 不是 ConnectError，包一层让调用方能统一按
        // ConnectError 处理。`Unavailable` 是合适的默认：能走到这里的失败
        // 基本都是「daemon 连接不可用」或「bridge 拒绝了这次调用」。
        throw ConnectError.from(error, Code.Unavailable);
      }

      return {
        stream: false,
        service: method.parent,
        method,
        header: new Headers(),
        trailer: new Headers(),
        message: fromBinary(method.output, new Uint8Array(response)),
      };
    },

    async stream(method, signal, _timeoutMs, _header, input, _contextValues) {
      signal?.throwIfAborted();

      // 服务端流：连接的 `input` 是一个 AsyncIterable，但 boxdd 一条客户端流
      // 都没有（build.rs 的解析器会对客户端流直接报错），所以这里只取第一条
      // 请求消息。
      const request = await firstRequest(method.input, input);

      const frames = createWritableIterable<Uint8Array>();
      let finished = false;
      // `WritableIterable.close()` 不接受错误，所以把错误存下来，等消费者读完
      // 已经到手的消息之后再从生成器里抛出去（见 `decodeFrames`）。这样「先收
      // 到几条、然后流断了」不会丢掉那几条。
      let streamError: ConnectError | undefined;
      const finish = (error?: ConnectError) => {
        if (finished) return;
        finished = true;
        streamError = error;
        frames.close();
      };

      const channel = new Channel<ArrayBuffer>();
      channel.onmessage = (raw) => {
        if (finished) return;
        const bytes = new Uint8Array(raw);
        switch (bytes[0]) {
          case FRAME_MESSAGE:
            void frames.write(bytes.subarray(1)).catch(() => {});
            break;
          case FRAME_END:
            finish();
            break;
          case FRAME_ERROR:
            finish(
              new ConnectError(
                new TextDecoder().decode(bytes.subarray(1)),
                Code.Unavailable,
              ),
            );
            break;
          default:
            finish(
              new ConnectError(
                `daemon bridge sent an unknown frame tag ${bytes[0]}`,
                Code.Internal,
              ),
            );
        }
      };

      let streamId: number;
      try {
        streamId = await invoke<number>("daemon_stream", {
          service: method.parent.typeName,
          method: method.name,
          request: Array.from(request),
          onEvent: channel,
        });
      } catch (error) {
        // 建流本身就失败了（没连上 daemon、allowlist 拒绝……）—— 直接抛，
        // 调用方拿到的是一个 rejected promise 而不是一个立刻结束的空流。
        throw ConnectError.from(error, Code.Unavailable);
      }

      // 取消：组件卸载、切页面、连接掉了都会走这里。窗口整个销毁时不需要 ——
      // 那时 webview 已经跑不了代码，由 Rust 的 `WindowEvent::Destroyed` 兜底。
      const cancel = () => {
        finish();
        void invoke("daemon_cancel", { id: streamId }).catch(() => {});
      };
      if (signal?.aborted) {
        cancel();
      } else {
        signal?.addEventListener("abort", cancel, { once: true });
      }

      return {
        stream: true,
        service: method.parent,
        method,
        header: new Headers(),
        trailer: new Headers(),
        message: decodeFrames(method.output, frames, () => streamError),
      };
    },
  };
}

/** boxdd 没有客户端流（见 build.rs 的断言），所以只取第一条请求消息。 */
async function firstRequest<T extends DescMessage>(
  desc: T,
  input: AsyncIterable<MessageInitShape<T>>,
): Promise<Uint8Array> {
  for await (const message of input) {
    return toBinary(desc, create(desc, message));
  }
  return toBinary(desc, create(desc));
}

async function* decodeFrames<T extends DescMessage>(
  desc: T,
  frames: AsyncIterable<Uint8Array>,
  takeError: () => ConnectError | undefined,
) {
  for await (const payload of frames) {
    yield fromBinary(desc, payload);
  }
  const error = takeError();
  if (error) throw error;
}
