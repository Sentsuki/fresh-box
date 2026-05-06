import { useCallback } from "react";
import {
  getClashApiUrl,
  isSingboxRunning,
  openUrl,
  startSingbox,
  stopSingbox,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useSingboxStore } from "../stores/singboxStore";
import { useClashStore } from "../stores/clashStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";

let statusCheckInterval: number | null = null;

function stopPolling() {
  if (statusCheckInterval !== null) {
    window.clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

function startPolling(onUnexpectedStop: () => void) {
  if (statusCheckInterval !== null) return;
  statusCheckInterval = window.setInterval(async () => {
    const isRunning = useSingboxStore.getState().isRunning;
    if (!isRunning) {
      stopPolling();
      return;
    }
    try {
      const running = await isSingboxRunning();
      if (!running) {
        useSingboxStore.getState().setRunning(false);
        stopPolling();
        onUnexpectedStop();
      }
    } catch {
      // polling error is silent
    }
  }, 5000);
}

export function useSingbox() {
  const { error: toastError, success: toastSuccess, info: toastInfo } =
    useToast();

  const startService = useCallback(async () => {
    const singbox = useSingboxStore.getState();
    const clash = useClashStore.getState();
    const settings = useSettingsStore.getState();
    const configPath = settings.settings.app.selected_config_path;

    if (singbox.isRunning || singbox.pendingOperation || !configPath) return;

    singbox.setPending(true);
    try {
      toastInfo("Starting sing-box...");
      await startSingbox(configPath);
      singbox.setRunning(true);
      startPolling(() => toastError("Sing-box has stopped unexpectedly."));
      await clash.refreshOverview(true);
      toastSuccess("Sing-box is running.");
    } catch (err) {
      singbox.setRunning(false);
      clash.clearOverview();
      toastError(`Error starting sing-box: ${getErrorMessage(err)}`);
    } finally {
      singbox.setPending(false);
    }
  }, [toastError, toastInfo, toastSuccess]);

  const stopService = useCallback(async () => {
    const singbox = useSingboxStore.getState();
    const clash = useClashStore.getState();

    if (!singbox.isRunning || singbox.pendingOperation) return;

    singbox.setPending(true);
    try {
      toastInfo("Stopping sing-box...");
      await stopSingbox();
      singbox.setRunning(false);
      stopPolling();
      clash.clearOverview();
      toastSuccess("Sing-box is stopped.");
    } catch (err) {
      toastError(`Error stopping sing-box: ${getErrorMessage(err)}`);
    } finally {
      singbox.setPending(false);
    }
  }, [toastError, toastInfo, toastSuccess]);

  const openPanel = useCallback(async () => {
    const settings = useSettingsStore.getState();
    const configPath = settings.settings.app.selected_config_path;
    if (!configPath) {
      toastError("No config selected");
      return;
    }
    try {
      const url = await getClashApiUrl(configPath);
      if (!url) {
        toastError("Clash API not configured in this config file");
        return;
      }
      await openUrl(url);
    } catch (err) {
      toastError(`Failed to open Clash API: ${getErrorMessage(err)}`);
    }
  }, [toastError]);

  return { startService, stopService, openPanel };
}
