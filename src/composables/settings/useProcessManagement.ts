import { computed, ref } from "vue";
import { getSingboxStatus, refreshSingboxDetection } from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { toast } from "../useToast";

export function useProcessManagement() {
  const isRefreshing = ref(false);
  const isGettingStatus = ref(false);
  const processStatus = ref("");

  const processStatusClass = computed(() => {
    if (!processStatus.value) {
      return "";
    }

    const normalized = processStatus.value.toLowerCase();
    if (normalized.includes("running") || normalized.includes("detected")) {
      return "status-success";
    }

    if (normalized.includes("failed") || normalized.includes("error")) {
      return "status-error";
    }

    return "status-info";
  });

  async function detectManagedProcess() {
    if (isRefreshing.value) {
      return;
    }

    isRefreshing.value = true;
    processStatus.value = "";

    try {
      const hasProcess = await refreshSingboxDetection();
      processStatus.value = hasProcess
        ? "Sing-box process detected and now under management"
        : "No sing-box process found";
    } catch (error) {
      processStatus.value = "Failed to detect sing-box process";
      toast.error(`Failed to detect sing-box process: ${getErrorMessage(error)}`);
    } finally {
      isRefreshing.value = false;
    }
  }

  async function loadManagedProcessStatus() {
    if (isGettingStatus.value) {
      return;
    }

    isGettingStatus.value = true;

    try {
      processStatus.value = await getSingboxStatus();
    } catch (error) {
      processStatus.value = "Failed to get sing-box status";
      toast.error(`Failed to get sing-box status: ${getErrorMessage(error)}`);
    } finally {
      isGettingStatus.value = false;
    }
  }

  return {
    isRefreshing,
    isGettingStatus,
    processStatus,
    processStatusClass,
    detectManagedProcess,
    loadManagedProcessStatus,
  };
}
