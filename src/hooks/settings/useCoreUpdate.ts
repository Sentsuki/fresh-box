import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo } from "react";
import { create } from 'zustand';
import {
  activateSingboxCore,
  getSingboxCoreStatus,
  updateSingboxCore,
} from "../../services/api";
import { getCommandErrorPayload, getErrorMessage } from "../../services/tauri";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../useToast";
import type {
  CoreUpdateProgressEvent,
  SingboxCoreOption,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
} from "../../types/app";

function toOptionKey(option: Pick<SingboxCoreOption, "channel" | "version">) {
  return `${option.channel}:${option.version}`;
}

interface CoreUpdateState {
  isRefreshingCoreStatus: boolean;
  isUpdatingCore: boolean;
  coreStatus: SingboxCoreStatus | null;
  coreStatusError: string;
  coreUpdateProgress: CoreUpdateProgressEvent | null;
  hasAutoRefreshedCoreStatus: boolean;
  setIsRefreshing: (val: boolean) => void;
  setIsUpdating: (val: boolean) => void;
  setCoreStatus: (status: SingboxCoreStatus | null) => void;
  setCoreStatusError: (err: string) => void;
  setCoreUpdateProgress: (prog: CoreUpdateProgressEvent | null) => void;
  setHasAutoRefreshed: (val: boolean) => void;
}

const useCoreUpdateStore = create<CoreUpdateState>((set) => ({
  isRefreshingCoreStatus: false,
  isUpdatingCore: false,
  coreStatus: null,
  coreStatusError: "",
  coreUpdateProgress: null,
  hasAutoRefreshedCoreStatus: false,
  setIsRefreshing: (val) => set({ isRefreshingCoreStatus: val }),
  setIsUpdating: (val) => set({ isUpdatingCore: val }),
  setCoreStatus: (status) => set({ coreStatus: status }),
  setCoreStatusError: (err) => set({ coreStatusError: err }),
  setCoreUpdateProgress: (prog) => set({ coreUpdateProgress: prog }),
  setHasAutoRefreshed: (val) => set({ hasAutoRefreshedCoreStatus: val }),
}));

interface UseCoreUpdateOptions {
  autoRefreshOnFirstMount?: boolean;
}

export function useCoreUpdate(options: UseCoreUpdateOptions = {}) {
  const store = useCoreUpdateStore();
  const appStore = useAppStore();
  const { autoRefreshOnFirstMount = false } = options;

  const selectedCoreOptionKey = appStore.appSettings.singbox_core.selected_option_key;
  const setSelectedCoreOptionKey = appStore.setSelectedCoreOptionKey;

  const selectedCoreOption = useMemo(() => {
    return (
      store.coreStatus?.available_options.find(
        (option) => toOptionKey(option) === selectedCoreOptionKey,
      ) ?? null
    );
  }, [store.coreStatus, selectedCoreOptionKey]);

  const currentCoreLabel = useMemo(() => {
    if (!store.coreStatus?.current_version) {
      return "Not installed";
    }
    const channelLabel =
      store.coreStatus.current_channel === "testing" ? "Testing" : "Stable";
    return `${channelLabel} · ${store.coreStatus.current_version}`;
  }, [store.coreStatus]);

  const selectedCoreLabel = useMemo(() => {
    return selectedCoreOption?.label ?? "No release selected";
  }, [selectedCoreOption]);

  const coreStatusText = useMemo(() => {
    if (store.isRefreshingCoreStatus && !store.coreStatus) {
      return "Checking";
    }
    if (store.coreStatusError) {
      return "Failed";
    }
    if (!store.coreStatus) {
      return "Unknown";
    }
    if (!store.coreStatus.installed) {
      return "Not Installed";
    }
    if (store.coreStatus.is_running) {
      return store.coreStatus.update_available ? "Update Available" : "Running";
    }
    return store.coreStatus.update_available ? "Update Available" : "Installed";
  }, [store.isRefreshingCoreStatus, store.coreStatus, store.coreStatusError]);

  const coreStatusBadgeClass = useMemo(() => {
    if (store.coreStatusError) return "bg-red-100 text-red-700";
    if (!store.coreStatus) return "bg-gray-100 text-gray-600";
    if (!store.coreStatus.installed) return "bg-gray-100 text-gray-600";
    if (store.coreStatus.update_available) return "bg-violet-100 text-violet-700";
    return "bg-green-100 text-green-700";
  }, [store.coreStatusError, store.coreStatus]);

  const updateCoreButtonLabel = useMemo(() => {
    if (store.isUpdatingCore) {
      return store.coreUpdateProgress?.stage === "downloading"
        ? "Downloading..."
        : "Applying...";
    }
    if (!selectedCoreOption) return "No Release Available";
    if (selectedCoreOption.installed && selectedCoreOption.is_active) {
      return selectedCoreOption.channel === "testing"
        ? "Reinstall Testing"
        : "Reinstall Stable";
    }
    if (selectedCoreOption.installed) return "Switch Core";
    return "Install & Switch";
  }, [store.isUpdatingCore, store.coreUpdateProgress, selectedCoreOption]);

  async function refreshCoreStatus(showErrorToast = false, forceRefresh = false) {
    if (useCoreUpdateStore.getState().isRefreshingCoreStatus) return;

    useCoreUpdateStore.getState().setIsRefreshing(true);
    useCoreUpdateStore.getState().setCoreStatusError("");

    try {
      const status = await getSingboxCoreStatus(forceRefresh);
      useCoreUpdateStore.getState().setCoreStatus(status);
    } catch (error) {
      useCoreUpdateStore.getState().setCoreStatus(null);
      const errorMsg = getErrorMessage(error);
      useCoreUpdateStore.getState().setCoreStatusError(errorMsg);
      if (showErrorToast) {
        toast.error(errorMsg);
      }
    } finally {
      useCoreUpdateStore.getState().setIsRefreshing(false);
    }
  }

  function formatCoreUpdateError(error: unknown) {
    const payload = getCommandErrorPayload(error);
    const fallback = getErrorMessage(error);
    switch (payload?.kind) {
      case "network_error":
        return fallback || "Unable to reach GitHub. Check your network connection and try again.";
      case "permission_denied":
        return fallback || "Permission denied while updating sing-box. Close other programs using the file and make sure fresh-box can write to the app directory.";
      case "validation_error":
        return fallback || "The requested sing-box release is unavailable or the downloaded package is invalid.";
      default:
        return fallback;
    }
  }

  async function applySelectedCore() {
    const currentSelectedOption = selectedCoreOption;
    if (!currentSelectedOption || useCoreUpdateStore.getState().isUpdatingCore) return;

    useCoreUpdateStore.getState().setIsUpdating(true);
    useCoreUpdateStore.getState().setCoreStatusError("");
    useCoreUpdateStore.getState().setCoreUpdateProgress({
      stage: "preparing",
      percent: 0,
      message: "Preparing the sing-box core action...",
    });

    try {
      if (currentSelectedOption.installed) {
        await activateSingboxCore(currentSelectedOption.channel, currentSelectedOption.version);
        await appStore.setActiveSingboxCoreSelection(currentSelectedOption.channel, currentSelectedOption.version);

        if (!currentSelectedOption.is_active) {
          toast.success(`Switched to ${currentSelectedOption.label}`);
        } else {
          const result: SingboxCoreUpdateResult = await updateSingboxCore(
            currentSelectedOption.channel,
            currentSelectedOption.version,
          );
          toast.success(
            result.restart_required
              ? `Sing-box core updated to ${result.current_version}. Restart sing-box to use the new core.`
              : `Sing-box core updated to ${result.current_version}`,
          );
        }
      } else {
        const result: SingboxCoreUpdateResult = await updateSingboxCore(
          currentSelectedOption.channel,
          currentSelectedOption.version,
        );
        toast.success(
          result.restart_required
            ? `Sing-box core updated to ${result.current_version}. Restart sing-box to use the new core.`
            : `Sing-box core updated to ${result.current_version}`,
        );
      }

      await appStore.setActiveSingboxCoreSelection(
        currentSelectedOption.channel,
        currentSelectedOption.version,
      );
      await refreshCoreStatus();
    } catch (error) {
      const message = formatCoreUpdateError(error);
      useCoreUpdateStore.getState().setCoreStatusError(message);
      toast.error(message);
    } finally {
      useCoreUpdateStore.getState().setIsUpdating(false);
      useCoreUpdateStore.getState().setCoreUpdateProgress(null);
    }
  }

  useEffect(() => {
    const options = store.coreStatus?.available_options;
    if (!options?.length) {
      if (selectedCoreOptionKey !== "") {
        void setSelectedCoreOptionKey("");
      }
      return;
    }

    const currentExists = options.some((option) => toOptionKey(option) === selectedCoreOptionKey);
    if (currentExists) return;

    const activeOption = options.find((option) => option.is_active);
    void setSelectedCoreOptionKey(toOptionKey(activeOption ?? options[0]));
  }, [store.coreStatus?.available_options, selectedCoreOptionKey, setSelectedCoreOptionKey]);

  useEffect(() => {
    if (autoRefreshOnFirstMount && !store.hasAutoRefreshedCoreStatus) {
      store.setHasAutoRefreshed(true);
      void refreshCoreStatus();
    }

    let unlistenProgress: UnlistenFn | null = null;
    void listen<CoreUpdateProgressEvent>("core-update-progress", (event) => {
      useCoreUpdateStore.getState().setCoreUpdateProgress(event.payload);
    }).then((unlisten) => {
      unlistenProgress = unlisten;
    });

    return () => {
      if (unlistenProgress) {
        unlistenProgress();
        unlistenProgress = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshOnFirstMount]);

  return {
    ...store,
    selectedCoreOptionKey,
    selectedCoreOption,
    currentCoreLabel,
    selectedCoreLabel,
    coreStatusText,
    coreStatusBadgeClass,
    updateCoreButtonLabel,
    refreshCoreStatus,
    applySelectedCore,
  };
}
