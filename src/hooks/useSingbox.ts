import { useCallback } from "react";
import { startSingbox, stopSingbox } from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";
import { useToast } from "./useToast";

/**
 * `isRunning`, the connections/traffic/memory/logs streams, the "stopped
 * unexpectedly" case, and the success/OS-notification pair for every
 * running-state transition (not just ones fresh-box itself asked for) are
 * all handled centrally by `useDaemonConnectionListener` reacting to the
 * daemon's own `daemon-state-changed` events — see its doc comment. This
 * hook is left with just: fire the RPC, and surface an immediate error if
 * it fails outright (a timeout, the daemon rejecting the request, ...).
 */
export function useSingbox() {
  const { error: toastError, info: toastInfo } = useToast();

  /**
   * 启动 sing-box。
   *
   * `reload: true` 表示「实例已经在跑，要换配置」—— daemon 的 `StartService`
   * 本身就是 `StartOrReloadService`，所以这两件事是同一个调用，不需要先停
   * （审计项 H-02）。区别只在于要不要跳过「已经在跑就别重复点」的防抖。
   */
  const startService = useCallback(
    async (options?: { reload?: boolean }) => {
      const singbox = useSingboxStore.getState();
      const settings = useSettingsStore.getState();
      const profileId = settings.settings.profiles.selected_profile_id;
      const reload = options?.reload ?? false;

      if (singbox.pendingOperation || !profileId) return;
      if (singbox.isRunning && !reload) return;

      singbox.setPending(true);
      try {
        toastInfo(reload ? "Reloading sing-box…" : "Starting sing-box...");
        await startSingbox(profileId);
      } catch (err) {
        toastError(`Error starting sing-box: ${getErrorMessage(err)}`);
      } finally {
        singbox.setPending(false);
      }
    },
    [toastError, toastInfo],
  );

  const stopService = useCallback(async () => {
    const singbox = useSingboxStore.getState();

    if (!singbox.isRunning || singbox.pendingOperation) return;

    singbox.setPending(true);
    try {
      toastInfo("Stopping sing-box...");
      await stopSingbox();
    } catch (err) {
      toastError(`Error stopping sing-box: ${getErrorMessage(err)}`);
    } finally {
      singbox.setPending(false);
    }
  }, [toastError, toastInfo]);

  return { startService, stopService };
}
