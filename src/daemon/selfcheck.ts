import { startedService } from "./clients";

/**
 * 阶段 0 的验收：证明「前端 → protobuf 编码 → Tauri IPC → Rust 字节透传 →
 * gRPC → daemon → 原路返回 → protobuf 解码」这条链路整条通了，且前端拿到的
 * 是一条类型完整的 protobuf 消息。
 *
 * 打的是 `StartedService.GetStartedAt` 而不是更直观的
 * `DesktopService.GetDaemonInfo`，因为要让这条自检在两种环境下都能跑：
 * `DesktopService` 的每个方法都要求 peer identity，而开发直连模式
 * （`FRESH_BOX_DAEMON_ADDR`，见 `daemon::dev_daemon_address`）提供不了；
 * `StartedService` 一处都不需要，且 `GetStartedAt` 连「实例已启动」都不要求。
 *
 * 这是脚手架，不是产品功能：阶段 5 接 `<DaemonGate>` 时，daemon 版本会从
 * 这里挪到真正的 UI 上，这个文件随之删除。
 *
 * 结果同时挂在 `window.__freshboxBridge` 上，方便在 devtools 里手动复算，
 * 比如再打一次别的 RPC 看 allowlist 的报错话术对不对。
 */

let done = false;

export interface BridgeSelfCheckResult {
  ok: boolean;
  /** sing-box 实例的启动时刻（Unix 毫秒）。没跑实例时是个哨兵值，这里不关心
   * 它的语义 —— 能解出一个 bigint 就说明 protobuf 解码是对的。 */
  startedAt?: bigint;
  elapsedMs: number;
  error?: string;
}

declare global {
  interface Window {
    __freshboxBridge?: {
      lastResult?: BridgeSelfCheckResult;
      /** 挂出来方便在 devtools 里手打别的 RPC，比如验证 allowlist 的报错话术。 */
      startedService: typeof startedService;
    };
  }
}

export async function runBridgeSelfCheck(): Promise<BridgeSelfCheckResult> {
  const startedAt = performance.now();
  try {
    const message = await startedService.getStartedAt({});
    const result: BridgeSelfCheckResult = {
      ok: true,
      startedAt: message.startedAt,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
    console.info(
      `[bridge] stage-0 OK — GetStartedAt returned ${result.startedAt}, ${result.elapsedMs}ms`,
      message,
    );
    return result;
  } catch (error) {
    const result: BridgeSelfCheckResult = {
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[bridge] stage-0 FAILED —", result.error, error);
    return result;
  }
}

/** 每个窗口生命周期内只跑一次，由 `useDaemonConnectionListener` 在相位首次
 * 变成 `connected` 时调用（更早调用必然拿到 `ProcessNotRunning`）。 */
export function runBridgeSelfCheckOnce(): void {
  if (done) return;
  done = true;
  void runBridgeSelfCheck().then((lastResult) => {
    window.__freshboxBridge = { lastResult, startedService };
  });
}
