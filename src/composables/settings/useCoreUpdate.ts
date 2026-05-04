import { computed, ref } from "vue";
import { getSingboxCoreStatus, updateSingboxCore } from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { toast } from "../useToast";
import type { SingboxCoreStatus, SingboxCoreUpdateResult } from "../../types/app";

export function useCoreUpdate() {
  const isRefreshingCoreStatus = ref(false);
  const isUpdatingCore = ref(false);
  const coreStatus = ref<SingboxCoreStatus | null>(null);
  const coreStatusError = ref("");

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

    if (coreStatus.value.is_running && coreStatus.value.update_available) {
      return "Stop Required";
    }

    if (coreStatus.value.is_running) {
      return "Running";
    }

    if (!coreStatus.value.installed) {
      return "Not Installed";
    }

    return coreStatus.value.update_available ? "Update Available" : "Up to Date";
  });

  const coreStatusBadgeClass = computed(() => {
    if (coreStatusError.value) {
      return "bg-red-100 text-red-700";
    }

    if (!coreStatus.value) {
      return "bg-gray-100 text-gray-600";
    }

    if (coreStatus.value.is_running && coreStatus.value.update_available) {
      return "bg-amber-100 text-amber-800";
    }

    if (coreStatus.value.update_available) {
      return "bg-violet-100 text-violet-700";
    }

    return "bg-green-100 text-green-700";
  });

  const updateCoreButtonLabel = computed(() => {
    if (isUpdatingCore.value) {
      return "Updating...";
    }

    if (coreStatus.value?.is_running) {
      return "Download Core";
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

  async function installCoreUpdate() {
    if (isUpdatingCore.value) {
      return;
    }

    isUpdatingCore.value = true;

    try {
      const result: SingboxCoreUpdateResult = await updateSingboxCore();
      toast.success(`Sing-box core updated to ${result.current_version}`);
      await refreshCoreStatus();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      isUpdatingCore.value = false;
    }
  }

  return {
    isRefreshingCoreStatus,
    isUpdatingCore,
    coreStatus,
    coreStatusError,
    coreStatusText,
    coreStatusBadgeClass,
    updateCoreButtonLabel,
    refreshCoreStatus,
    installCoreUpdate,
  };
}
