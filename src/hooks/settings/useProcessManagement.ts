import { useState, useMemo, useCallback } from "react";
import { getSingboxStatus } from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { toast } from "../useToast";

export function useProcessManagement() {
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [processStatus, setProcessStatus] = useState("");

  const processStatusClass = useMemo(() => {
    if (!processStatus) {
      return "";
    }

    const normalized = processStatus.toLowerCase();
    if (normalized.includes("running") || normalized.includes("detected")) {
      return "text-green-500";
    }

    if (normalized.includes("failed") || normalized.includes("error")) {
      return "text-red-500";
    }

    return "text-blue-500";
  }, [processStatus]);

  const refreshManagedProcessStatus = useCallback(async () => {
    if (isRefreshingStatus) {
      return;
    }

    setIsRefreshingStatus(true);

    try {
      const status = await getSingboxStatus();
      setProcessStatus(status);
    } catch (error) {
      setProcessStatus("Failed to get sing-box status");
      toast.error(`Failed to get sing-box status: ${getErrorMessage(error)}`);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, [isRefreshingStatus]);

  return {
    isRefreshingStatus,
    processStatus,
    processStatusClass,
    refreshManagedProcessStatus,
  };
}
