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

  const startService = useCallback(async () => {
    const singbox = useSingboxStore.getState();
    const settings = useSettingsStore.getState();
    const configPath = settings.settings.profiles.selected_config_path;

    if (singbox.isRunning || singbox.pendingOperation || !configPath) return;

    singbox.setPending(true);
    try {
      toastInfo("Starting sing-box...");
      await startSingbox(configPath);
    } catch (err) {
      toastError(`Error starting sing-box: ${getErrorMessage(err)}`);
    } finally {
      singbox.setPending(false);
    }
  }, [toastError, toastInfo]);

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
