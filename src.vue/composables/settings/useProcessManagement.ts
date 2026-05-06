import { computed, ref } from "vue";
import { getSingboxStatus } from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { toast } from "../useToast";

export function useProcessManagement() {
  const isRefreshingStatus = ref(false);
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

  async function refreshManagedProcessStatus() {
    if (isRefreshingStatus.value) {
      return;
    }

    isRefreshingStatus.value = true;

    try {
      processStatus.value = await getSingboxStatus();
    } catch (error) {
      processStatus.value = "Failed to get sing-box status";
      toast.error(`Failed to get sing-box status: ${getErrorMessage(error)}`);
    } finally {
      isRefreshingStatus.value = false;
    }
  }

  return {
    isRefreshingStatus,
    processStatus,
    processStatusClass,
    refreshManagedProcessStatus,
  };
}
