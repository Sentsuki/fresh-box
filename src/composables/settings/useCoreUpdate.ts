import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getSingboxCoreStatus, updateSingboxCore } from "../../services/api";
import { getCommandErrorPayload, getErrorMessage } from "../../services/tauri";
import { toast } from "../useToast";
import type {
  CoreUpdateProgressEvent,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
} from "../../types/app";

export function useCoreUpdate() {
  let unlistenProgress: UnlistenFn | null = null;

  const isRefreshingCoreStatus = ref(false);
  const isUpdatingCore = ref(false);
  const coreStatus = ref<SingboxCoreStatus | null>(null);
  const coreStatusError = ref("");
  const coreUpdateProgress = ref<CoreUpdateProgressEvent | null>(null);

  const coreStatusText = computed(() => {
    if (isRefreshingCoreStatus.value && !coreStatus.value) {
      return "Checking";
    }

    if (coreStatusError.value) {
      return "Failed";
    }

    if (!coreStatus.value) {
      return "Unknown";
    }

    if (coreStatus.value.is_running) {
      return coreStatus.value.update_available ? "Update Available" : "Running";
    }

    if (!coreStatus.value.installed) {
      return "Not Installed";
    }

    return coreStatus.value.update_available
      ? "Update Available"
      : "Up to Date";
  });

  const coreStatusBadgeClass = computed(() => {
    if (coreStatusError.value) {
      return "bg-red-100 text-red-700";
    }

    if (!coreStatus.value) {
      return "bg-gray-100 text-gray-600";
    }

    if (coreStatus.value.update_available) {
      return "bg-violet-100 text-violet-700";
    }

    return "bg-green-100 text-green-700";
  });

  const updateCoreButtonLabel = computed(() => {
    if (isUpdatingCore.value) {
      return coreUpdateProgress.value?.stage === "downloading"
        ? "Downloading..."
        : "Updating...";
    }

    if (coreStatus.value?.is_running) {
      return "Update Core";
    }

    if (!coreStatus.value?.installed) {
      return "Install Latest Core";
    }

    return coreStatus.value.update_available
      ? "Update Core"
      : "Reinstall Latest Core";
  });

  async function refreshCoreStatus(showErrorToast = false) {
    if (isRefreshingCoreStatus.value) {
      return;
    }

    isRefreshingCoreStatus.value = true;
    coreStatusError.value = "";

    try {
      coreStatus.value = await getSingboxCoreStatus();
    } catch (error) {
      coreStatus.value = null;
      coreStatusError.value = getErrorMessage(error);
      if (showErrorToast) {
        toast.error(coreStatusError.value);
      }
    } finally {
      isRefreshingCoreStatus.value = false;
    }
  }

  function formatCoreUpdateError(error: unknown) {
    const payload = getCommandErrorPayload(error);
    const fallback = getErrorMessage(error);

    switch (payload?.kind) {
      case "network_error":
        return (
          fallback ||
          "Unable to reach GitHub. Check your network connection and try again."
        );
      case "permission_denied":
        return (
          fallback ||
          "Permission denied while updating sing-box. Close other programs using the file and make sure fresh-box can write to the app directory."
        );
      case "validation_error":
        return (
          fallback ||
          "The downloaded sing-box package could not be verified safely. Please try again later."
        );
      default:
        return fallback;
    }
  }

  async function installCoreUpdate() {
    if (isUpdatingCore.value) {
      return;
    }

    isUpdatingCore.value = true;
    coreStatusError.value = "";
    coreUpdateProgress.value = {
      stage: "preparing",
      percent: 0,
      message: "Preparing the sing-box core update...",
    };

    try {
      const result: SingboxCoreUpdateResult = await updateSingboxCore();
      toast.success(
        result.restart_required
          ? `Sing-box core updated to ${result.current_version}. Restart sing-box to use the new core.`
          : `Sing-box core updated to ${result.current_version}`,
      );
      await refreshCoreStatus();
    } catch (error) {
      const message = formatCoreUpdateError(error);
      coreStatusError.value = message;
      toast.error(message);
    } finally {
      isUpdatingCore.value = false;
      coreUpdateProgress.value = null;
    }
  }

  onMounted(() => {
    void refreshCoreStatus();
    void listen<CoreUpdateProgressEvent>("core-update-progress", (event) => {
      coreUpdateProgress.value = event.payload;
    }).then((unlisten) => {
      unlistenProgress = unlisten;
    });
  });

  onUnmounted(() => {
    if (unlistenProgress) {
      unlistenProgress();
      unlistenProgress = null;
    }
  });

  return {
    isRefreshingCoreStatus,
    isUpdatingCore,
    coreStatus,
    coreStatusError,
    coreUpdateProgress,
    coreStatusText,
    coreStatusBadgeClass,
    updateCoreButtonLabel,
    refreshCoreStatus,
    installCoreUpdate,
  };
}
