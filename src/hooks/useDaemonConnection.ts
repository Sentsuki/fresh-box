import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import { getDaemonState } from "../services/api";
import type { DaemonConnectionPhase } from "../types/daemon";
import { useClashStore } from "../stores/clashStore";
import { useSingboxStore } from "../stores/singboxStore";
import { isWindowVisible } from "./useWindowVisibility";
import {
  startConnectionsStream,
  stopConnectionsStream,
} from "./useConnectionsStream";
import { startLogsStream, stopLogsStream } from "./useLogsStream";
import { startTrafficStream, stopTrafficStream } from "./useTrafficStream";
import { startMemoryStream, stopMemoryStream } from "./useMemoryStream";
import { useToast } from "./useToast";

async function notifyOs(body: string) {
  try {
    let permitted = await isPermissionGranted();
    if (!permitted) {
      const result = await requestPermission();
      permitted = result === "granted";
    }
    if (permitted) sendNotification({ title: "sing-box", body });
  } catch {
    // notifications are best-effort
  }
}

type Toast = ReturnType<typeof useToast>;

/**
 * Reconciles one incoming `DaemonConnectionPhase` into the store and,
 * for a transition into/out of "running", the side effects that used to
 * live inline in `useSingbox.ts`'s `startService`/`stopService` and in the
 * old 5s "did it stop unexpectedly" polling loop — both gone now, because
 * this fires for *every* way the running state can change, not just the
 * ones fresh-box itself initiated (e.g. boxdd auto-resuming the last
 * config on its own after a reboot, another client stopping it, ...).
 *
 * `announce` is false only for the very first phase applied at mount (the
 * synchronous `getDaemonState()` snapshot) — otherwise every app launch
 * where sing-box happened to already be running would fire a "sing-box is
 * running" notification.
 */
function applyPhase(
  phase: DaemonConnectionPhase,
  announce: boolean,
  toast: Toast,
) {
  const singbox = useSingboxStore.getState();
  const wasRunning = singbox.isRunning;
  const running =
    phase.phase === "connected" && phase.status.state === "started";

  singbox.setConnectionPhase(phase);
  singbox.setRunning(running);

  if (running === wasRunning) return;

  if (running) {
    // Mirrors `useWindowVisibilityListener`'s own hide/show handling —
    // skip starting streams for a hidden window; it picks them up itself
    // once the window becomes visible again while `isRunning` is true.
    if (isWindowVisible()) {
      startConnectionsStream();
      startTrafficStream();
      startMemoryStream();
      void startLogsStream();
    }
    void useClashStore.getState().refreshOverview(announce);
    if (announce) {
      toast.success("sing-box is running.");
      void notifyOs("sing-box is running.");
    }
    return;
  }

  stopConnectionsStream(true);
  stopTrafficStream(true);
  stopMemoryStream(true);
  void stopLogsStream(true);
  useClashStore.getState().clearOverview();

  if (!announce) return;

  if (phase.phase === "connected" && phase.status.state === "fatal") {
    toast.error(
      "sing-box has stopped unexpectedly.",
      phase.status.errorMessage || undefined,
    );
    void notifyOs("sing-box has stopped unexpectedly.");
  } else if (phase.phase === "connected") {
    // Idle/Starting/Stopping — a clean stop, whether we asked for it
    // (`stopService`) or something else did.
    toast.success("sing-box is stopped.");
    void notifyOs("sing-box is stopped.");
  } else {
    // Dropped out of "connected" entirely — lost the daemon, not just the
    // sing-box instance (worker died, service restarted out from under
    // us, ...). The reconciliation loop is already retrying on its own.
    toast.error("Lost connection to sing-box-daemon.");
    void notifyOs("Lost connection to sing-box-daemon.");
  }
}

/**
 * Registers once at the App root. Fetches the daemon connection's current
 * phase for the initial render, then subscribes to `daemon-state-changed`
 * for the rest of the app's lifetime — the single source of truth for "is
 * sing-box running", replacing the old scattered one-shot checks
 * (`initializeApp()`'s one-time `isSingboxRunning()` call, a window-focus
 * reconnect that never told the frontend anything, and a 5s polling loop
 * that only ran while already believed running). See
 * `services/singbox.rs`'s `spawn_reconciliation_loop` for the Rust-side
 * half of this — modeled on the official Electron client's
 * `DaemonState`/`state.ts`.
 */
export function useDaemonConnectionListener() {
  const toast = useToast();

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    let receivedEvent = false;

    void listen<DaemonConnectionPhase>("daemon-state-changed", (event) => {
      receivedEvent = true;
      applyPhase(event.payload, true, toast);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    // A later event may well resolve before this initial snapshot does —
    // don't let a stale snapshot clobber it.
    void getDaemonState().then((phase) => {
      if (!cancelled && !receivedEvent) applyPhase(phase, false, toast);
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
