import {
  getClashApiUrl,
  isSingboxRunning,
  openUrl,
  startSingbox,
  stopSingbox,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useAppStore } from "../stores/appStore";
import { useClashStore } from "./useClash";
import { toast } from "./useToast";

let statusCheckInterval: number | null = null;

function stopPolling() {
  if (statusCheckInterval !== null) {
    window.clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

async function checkSingboxStatus() {
  const appStore = useAppStore.getState();
  if (!appStore.isRunning) {
    stopPolling();
    return;
  }

  try {
    const running = await isSingboxRunning();
    if (!running) {
      appStore.setRunning(false);
      stopPolling();
      toast.error("Sing-box has stopped unexpectedly.");
    }
  } catch (error) {
    toast.error(`Failed to check service status: ${getErrorMessage(error)}`);
  }
}

function ensurePolling() {
  if (statusCheckInterval === null) {
    statusCheckInterval = window.setInterval(checkSingboxStatus, 5000);
  }
}

export function useSingbox() {
  async function initializeSingbox() {
    const appStore = useAppStore.getState();
    const clash = useClashStore.getState();
    const running = await isSingboxRunning();
    appStore.setRunning(running);

    if (running) {
      ensurePolling();
      await clash.refreshOverview();
    } else {
      stopPolling();
      clash.clearOverview();
    }
  }

  async function startService() {
    const appStore = useAppStore.getState();
    const clash = useClashStore.getState();
    if (
      appStore.isRunning ||
      appStore.pendingOperations > 0 ||
      !appStore.appSettings.app.selected_config_path
    ) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
        toast.info("Starting sing-box...");
        const selectedConfigPath = appStore.appSettings.app.selected_config_path;
        if (!selectedConfigPath) {
          return;
        }
        await startSingbox(selectedConfigPath);
      });

      appStore.setRunning(true);
      ensurePolling();
      await clash.refreshOverview(true);
      toast.success("Sing-box is running.");
    } catch (error) {
      appStore.setRunning(false);
      clash.clearOverview();
      toast.error(`Error starting sing-box: ${getErrorMessage(error)}`);
    }
  }

  async function stopService() {
    const appStore = useAppStore.getState();
    const clash = useClashStore.getState();
    if (!appStore.isRunning || appStore.pendingOperations > 0) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
        toast.info("Stopping sing-box...");
        await stopSingbox();
      });

      appStore.setRunning(false);
      stopPolling();
      clash.clearOverview();
      toast.success("Sing-box is stopped.");
    } catch (error) {
      toast.error(`Error stopping sing-box: ${getErrorMessage(error)}`);
    }
  }

  async function openPanel() {
    const appStore = useAppStore.getState();
    if (!appStore.appSettings.app.selected_config_path) {
      toast.error("No config selected");
      return;
    }

    try {
      const url = await getClashApiUrl(appStore.appSettings.app.selected_config_path);
      if (!url) {
        toast.error("Clash API not configured in this config file");
        return;
      }

      await openUrl(url);
    } catch (error) {
      toast.error(`Failed to open Clash API: ${getErrorMessage(error)}`);
    }
  }

  return {
    initializeSingbox,
    startService,
    stopService,
    openPanel,
  };
}
