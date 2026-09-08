import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Transport } from "@connectrpc/connect";

import { invokeRaw } from "../services/tauri";

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

    stream() {
      throw new ConnectError(
        "streaming over the daemon bridge is not wired up yet (stage 2)",
        Code.Unimplemented,
      );
    },
  };
}
