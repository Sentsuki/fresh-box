import type {
  NetworkQualityProgress,
  NetworkQualityTestOptions,
  StunTestProgress,
  StunTestOptions,
} from "../types/app";
import { applicationService, startedService } from "./clients";
import { useSingboxStore } from "../stores/singboxStore";

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
 *
 * 两套 RPC，按有没有跑着的实例二选一：
 *
 *   跑着   `StartedService.Start*Test`      —— 测的是**经过代理**的链路，
 *                                              可以指定 `outboundTag`
 *   没跑   `ApplicationService.StartStandalone*Test` —— worker 直接测，
 *                                              没有出站可选（也就没有
 *                                              `outboundTag` 这个参数）
 *
 * 以前只有前一套，于是「想测一下网络质量」必须先把服务装好、实例起起来
 * （审计项 L-20）。两条流的进度消息是同一个类型，所以下面的适配只写一份。
 */

/** 当前有没有跑着的 sing-box 实例 —— 决定用哪套 RPC。 */
function hasRunningInstance(): boolean {
  return useSingboxStore.getState().isRunning;
}

export async function runNetworkQualityTest(
  options: NetworkQualityTestOptions,
  onProgress: (progress: NetworkQualityProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const stream = hasRunningInstance()
    ? startedService.startNetworkQualityTest(
        {
          configURL: options.configURL,
          outboundTag: options.outboundTag,
          serial: options.serial,
          http3: options.http3,
          maxRuntimeSeconds: options.maxRuntimeSeconds,
        },
        { signal },
      )
    : applicationService.startStandaloneNetworkQualityTest(
        {
          configUrl: options.configURL,
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
  // 方法名是 `startSTUNTest` / `startStandaloneSTUNTest`：proto 里是
  // `StartSTUNTest`，protobuf-es 只把首字母小写。别「顺手改成」`startStunTest`。
  const stream = hasRunningInstance()
    ? startedService.startSTUNTest(
        { server: options.server, outboundTag: options.outboundTag },
        { signal },
      )
    : applicationService.startStandaloneSTUNTest(
        { server: options.server },
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
