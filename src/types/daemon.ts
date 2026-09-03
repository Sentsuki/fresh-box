// Mirrors `src-tauri/src/services/singbox.rs`'s `ConnectionPhase`/
// `SingboxStatus` — keep these two in sync by hand (no shared codegen
// between the Rust and TS sides for this).

export type SingboxRunState =
  "idle" | "starting" | "started" | "stopping" | "fatal";

export interface SingboxStatus {
  state: SingboxRunState;
  errorMessage: string;
}

/**
 * The daemon connection's current phase, as pushed by the Rust-side
 * reconciliation loop (`daemon-state-changed` event) and readable
 * synchronously via `getDaemonState()`. This is the single source of truth
 * for "is sing-box running" — see `useDaemonConnectionListener`.
 */
export type DaemonConnectionPhase =
  | { phase: "connecting" }
  | { phase: "connected"; status: SingboxStatus }
  | { phase: "not-installed" }
  | {
      phase: "version-mismatch";
      daemonVersion: string;
      bundledVersion: string;
    }
  | { phase: "owned-by-other-user" }
  | { phase: "unavailable"; errorMessage: string };

export function isDaemonRunning(phase: DaemonConnectionPhase): boolean {
  return phase.phase === "connected" && phase.status.state === "started";
}
