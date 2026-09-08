import type {
  NetworkQualityProgress,
  NetworkQualityTestOptions,
  StunTestProgress,
  StunTestOptions,
} from "../types/app";
import { startedService } from "./clients";

/**
 * 网络质量测试与 STUN 测试。
 *
 * 以前是「start 命令 + Tauri 事件 + cancel 命令」三件套（`services/tools.rs`
 * 加 `commands/tools.rs`，共约 250 行 Rust）。走 bridge 之后它就是一条普通的
 * 服务端流：`for await` 读进度，取消就 abort 那个 signal —— 不需要 Rust 侧的
 * 任务槽位管理，也不需要一个单独的 cancel 命令。
 *
 * 这里的 bigint → number 转换是前端把 proto 消息适配到自己的视图模型，不是
 * 「发明数据」：字段一一对应，没有凭空造出来的东西，而且这一步发生在消费端
 * 而不是被 Rust 冒充成数据源。
 */

export async function runNetworkQualityTest(
  options: NetworkQualityTestOptions,
  onProgress: (progress: NetworkQualityProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const stream = startedService.startNetworkQualityTest(
    {
      configURL: options.configURL,
      outboundTag: options.outboundTag,
      serial: options.serial,
      http3: options.http3,
      maxRuntimeSeconds: options.maxRuntimeSeconds,
    },
    { signal },
  );

  for await (const message of stream) {
    onProgress({
      phase: message.phase,
      downloadCapacity: Number(message.downloadCapacity),
      uploadCapacity: Number(message.uploadCapacity),
      downloadRPM: message.downloadRPM,
      uploadRPM: message.uploadRPM,
      idleLatencyMs: message.idleLatencyMs,
      elapsedMs: Number(message.elapsedMs),
      isFinal: message.isFinal,
      error: message.error,
      downloadCapacityAccuracy: message.downloadCapacityAccuracy,
      uploadCapacityAccuracy: message.uploadCapacityAccuracy,
      downloadRPMAccuracy: message.downloadRPMAccuracy,
      uploadRPMAccuracy: message.uploadRPMAccuracy,
    });
    if (message.isFinal) return;
  }
}

export async function runStunTest(
  options: StunTestOptions,
  onProgress: (progress: StunTestProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  // 方法名是 `startSTUNTest`：proto 里叫 `StartSTUNTest`，protobuf-es 只把首
  // 字母小写。别「顺手改成」`startStunTest`。
  const stream = startedService.startSTUNTest(
    { server: options.server, outboundTag: options.outboundTag },
    { signal },
  );

  for await (const message of stream) {
    onProgress({
      phase: message.phase,
      externalAddr: message.externalAddr,
      latencyMs: message.latencyMs,
      natMapping: message.natMapping,
      natFiltering: message.natFiltering,
      isFinal: message.isFinal,
      error: message.error,
      natTypeSupported: message.natTypeSupported,
    });
    if (message.isFinal) return;
  }
}
