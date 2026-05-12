import { useEffect, useCallback, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  activateSingboxCore,
  cancelCoreUpdate,
  getSingboxCoreStatus,
  updateSingboxCore,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";
import type {
  CoreUpdateProgressEvent,
  SingboxCoreOption,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
} from "../types/app";

function toOptionKey(option: Pick<SingboxCoreOption, "channel" | "version">) {
  return `${option.channel}:${option.version}`;
}

export function useCoreUpdate(autoRefreshOnMount = false) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [coreStatus, setCoreStatus] = useState<SingboxCoreStatus | null>(null);
  const [coreStatusError, setCoreStatusError] = useState("");
  const [coreUpdateProgress, setCoreUpdateProgress] =
    useState<CoreUpdateProgressEvent | null>(null);

  const hasAutoRefreshed = useRef(false);

  const selectedCoreOptionKey = useSettingsStore(
    (s) => s.settings.Settings.singbox_core.selected_option_key,
  );
  const setSelectedCoreOptionKey = useSettingsStore(
    (s) => s.setSelectedCoreOptionKey,
  );

  const { success, error: toastError } = useToast();

  const refreshCoreStatus = useCallback(
    async (showErrorToast = false, forceRefresh = false) => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      setCoreStatusError("");
      try {
        const status = await getSingboxCoreStatus(forceRefresh);
        setCoreStatus(status);
        // Surface a non-fatal network error embedded in the status
        // (e.g. GitHub unreachable during Check) without throwing.
        if (status.fetch_error) {
          setCoreStatusError(status.fetch_error);
          if (showErrorToast) toastError(status.fetch_error);
        }
        // Auto-select an option if none is selected yet
        const options = status.available_options ?? [];
        if (options.length > 0) {
          const currentExists = options.some(
            (o) => toOptionKey(o) === selectedCoreOptionKey,
          );
          if (!currentExists) {
            const active = options.find((o) => o.is_active);
            void setSelectedCoreOptionKey(toOptionKey(active ?? options[0]));
          }
        }
      } catch (err) {
        const msg = getErrorMessage(err);
        setCoreStatus(null);
        setCoreStatusError(msg);
        if (showErrorToast) toastError(msg);
      } finally {
        setIsRefreshing(false);
      }
    },
    [isRefreshing, selectedCoreOptionKey, setSelectedCoreOptionKey, toastError],
  );

  const applySelectedCore = useCallback(
    async (keyOverride?: string) => {
      if (!coreStatus || isUpdating) return;
      const options = coreStatus.available_options ?? [];
      const key = keyOverride ?? selectedCoreOptionKey;
      const selectedOption = options.find((o) => toOptionKey(o) === key);
      if (!selectedOption) return;

      setIsUpdating(true);
      setCoreStatusError("");
      setCoreUpdateProgress({
        stage: "preparing",
        percent: 0,
        message: "Preparing the sing-box core action...",
      });
      try {
        if (selectedOption.installed && !selectedOption.is_active) {
          // Already installed — just activate (no download needed).
          await activateSingboxCore(
            selectedOption.channel,
            selectedOption.version,
          );
          success(`Switched to ${selectedOption.label}`);
        } else {
          // Download + install (new version, or reinstall of active version).
          const result: SingboxCoreUpdateResult = await updateSingboxCore(
            selectedOption.channel,
            selectedOption.version,
          );
          success(
            result.restart_required
              ? `Core updated to ${result.current_version}. Restart sing-box to apply.`
              : `Core updated to ${result.current_version}`,
          );
        }
        // Re-read backend state — it is the single source of truth for active_channel/active_version.
        await refreshCoreStatus();
      } catch (err) {
        const msg = getErrorMessage(err);
        if (
          msg.toLowerCase().includes("cancelled") ||
          msg.toLowerCase().includes("cancel")
        ) {
          setCoreStatusError("");
        } else {
          setCoreStatusError(msg);
          toastError(msg);
        }
      } finally {
        setIsUpdating(false);
        setCoreUpdateProgress(null);
      }
    },
    [
      coreStatus,
      isUpdating,
      selectedCoreOptionKey,
      success,
      toastError,
      refreshCoreStatus,
    ],
  );

  const cancelUpdate = useCallback(async () => {
    if (!isUpdating) return;
    try {
      await cancelCoreUpdate();
    } catch {
      // Best-effort cancellation; ignore errors.
    }
  }, [isUpdating]);

  useEffect(() => {
    if (autoRefreshOnMount && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      // Backend decides everything: normal page load reads cache only, no network.
      void refreshCoreStatus();
    }

    const unlistenPromise = listen<CoreUpdateProgressEvent>(
      "core-update-progress",
      (event) => {
        setCoreUpdateProgress(event.payload);
      },
    );

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [autoRefreshOnMount, refreshCoreStatus]);

  const options = coreStatus?.available_options ?? [];
  const selectedOption = options.find(
    (o) => toOptionKey(o) === selectedCoreOptionKey,
  );

  const currentCoreLabel = coreStatus?.current_version
    ? `${coreStatus.current_channel === "testing" ? "Testing" : "Stable"} · ${coreStatus.current_version}`
    : "Not installed";

  const selectedCoreLabel = selectedOption?.label ?? "No release selected";

  let coreStatusText = "Unknown";
  if (isRefreshing && !coreStatus) {
    coreStatusText = "Checking";
  } else if (coreStatusError) {
    coreStatusText = "Failed";
  } else if (coreStatus) {
    if (!coreStatus.installed) {
      coreStatusText = "Not Installed";
    } else if (coreStatus.update_available) {
      coreStatusText = "Update Available";
    } else if (coreStatus.is_running) {
      coreStatusText = "Running";
    } else {
      coreStatusText = "Installed";
    }
  }

  let updateCoreButtonLabel = "No Release Available";
  if (isUpdating) {
    updateCoreButtonLabel =
      coreUpdateProgress?.stage === "downloading"
        ? "Downloading..."
        : "Applying...";
  } else if (selectedOption?.installed && selectedOption?.is_active) {
    updateCoreButtonLabel = "Reinstall";
  }

  return {
    isRefreshingCoreStatus: isRefreshing,
    isUpdatingCore: isUpdating,
    coreStatus,
    coreStatusError,
    coreUpdateProgress,
    selectedCoreOptionKey,
    setSelectedCoreOptionKey,
    selectedOption,
    currentCoreLabel,
    selectedCoreLabel,
    coreStatusText,
    updateCoreButtonLabel,
    refreshCoreStatus,
    applySelectedCore,
    cancelUpdate,
    cacheState: coreStatus?.cache_state ?? "no_cache",
  };
}
