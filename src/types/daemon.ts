/**
 * daemon 连接相位 —— 类型由 Rust 生成（`src/gen/host.ts`），这里只重命名。
 *
 * 阶段 5 之前这份是手抄的，文件顶上还写着「手工保持同步」。现在 Rust 侧加一个
 * 相位，`DaemonGate` 的映射表会直接编译报错（见那里的注释）。
 */

export type {
  ConnectionPhase as DaemonConnectionPhase,
  SingboxRunState,
  SingboxStatus,
} from "../gen/host";

import type { ConnectionPhase } from "../gen/host";

/** 所有相位名 —— `DaemonGate` 的映射表按它做穷举校验。 */
export type DaemonPhaseName = ConnectionPhase["phase"];

export function isDaemonRunning(phase: ConnectionPhase): boolean {
  return phase.phase === "connected" && phase.status.state === "started";
}
