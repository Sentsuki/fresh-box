/**
 * 镜像 `src-tauri/src/services/singbox.rs` 的 `ConnectionPhase`/`SingboxStatus`。
 *
 * 手工保持同步（daemon 域的类型是 protobuf 生成的，host 域这部分还不是）。
 * 但**漏掉一个相位**这件事已经不可能了：`DaemonGate` 用一张
 * `Record<DaemonConnectionPhase["phase"], ...>` 映射表，少一项就是编译错误
 * （审计项 H-01）。
 */

export type SingboxRunState =
  | "idle"
  | "starting"
  | "started"
  | "stopping"
  | "fatal";

export interface SingboxStatus {
  state: SingboxRunState;
  errorMessage: string;
}

export type DaemonConnectionPhase =
  | { phase: "connecting" }
  | { phase: "connected"; status: SingboxStatus }
  | { phase: "not-installed" }
  | { phase: "not-running" }
  | {
      phase: "version-mismatch";
      daemonVersion: string;
      bundledVersion: string;
    }
  | { phase: "owned-by-other-user" }
  | { phase: "unavailable"; errorMessage: string };

/** 所有相位名 —— `DaemonGate` 的映射表按它做穷举校验。 */
export type DaemonPhaseName = DaemonConnectionPhase["phase"];

export function isDaemonRunning(phase: DaemonConnectionPhase): boolean {
  return phase.phase === "connected" && phase.status.state === "started";
}
