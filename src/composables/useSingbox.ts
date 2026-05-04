import {
  getClashApiUrl,
  isSingboxRunning,
  openUrl,
  startSingbox,
  stopSingbox,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";

const appStore = useAppStore();
let statusCheckInterval: number | null = null;

function stopPolling() {
  if (statusCheckInterval !== null) {
    window.clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

async function checkSingboxStatus() {
  if (!appStore.isRunning.value) {
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
    const running = await isSingboxRunning();
    appStore.setRunning(running);

    if (running) {
      ensurePolling();
    } else {
      stopPolling();
    }
  }

  async function startService() {
    if (
      appStore.isRunning.value ||
      appStore.isLoading.value ||
      !appStore.selectedConfigPath.value
    ) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
        toast.info("Starting sing-box...");
        const selectedConfigPath = appStore.selectedConfigPath.value;
        if (!selectedConfigPath) {
          return;
        }
        await startSingbox(selectedConfigPath);
      });

      appStore.setRunning(true);
      ensurePolling();
      toast.success("Sing-box is running.");
    } catch (error) {
      appStore.setRunning(false);
      toast.error(`Error starting sing-box: ${getErrorMessage(error)}`);
    }
  }

  async function stopService() {
    if (!appStore.isRunning.value || appStore.isLoading.value) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
        toast.info("Stopping sing-box...");
        await stopSingbox();
      });

      appStore.setRunning(false);
      stopPolling();
      toast.success("Sing-box is stopped.");
    } catch (error) {
      toast.error(`Error stopping sing-box: ${getErrorMessage(error)}`);
    }
  }

  async function openPanel() {
    if (!appStore.selectedConfigPath.value) {
      toast.error("No config selected");
      return;
    }

    try {
      const url = await getClashApiUrl(appStore.selectedConfigPath.value);
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
