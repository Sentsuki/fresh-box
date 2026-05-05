import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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

export function useCoreUpdate() {
  let unlistenProgress: UnlistenFn | null = null;
  const appStore = useAppStore();

  const isRefreshingCoreStatus = ref(false);
  const isUpdatingCore = ref(false);
  const coreStatus = ref<SingboxCoreStatus | null>(null);
  const coreStatusError = ref("");
  const coreUpdateProgress = ref<CoreUpdateProgressEvent | null>(null);
  const selectedCoreOptionKey = ref("");

  const selectedCoreOption = computed(() => {
    return (
      coreStatus.value?.available_options.find(
        (option) => toOptionKey(option) === selectedCoreOptionKey.value,
      ) ?? null
    );
  });

  const currentCoreLabel = computed(() => {
    if (!coreStatus.value?.current_version) {
      return "Not installed";
    }

    const channelLabel =
      coreStatus.value.current_channel === "testing" ? "Testing" : "Stable";
    return `${channelLabel} · ${coreStatus.value.current_version}`;
  });

  const selectedCoreLabel = computed(() => {
    return selectedCoreOption.value?.label ?? "No release selected";
  });

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

    if (!coreStatus.value.installed) {
      return "Not Installed";
    }

    if (coreStatus.value.is_running) {
      return coreStatus.value.update_available ? "Update Available" : "Running";
    }

    return coreStatus.value.update_available ? "Update Available" : "Installed";
  });

  const coreStatusBadgeClass = computed(() => {
    if (coreStatusError.value) {
      return "bg-red-100 text-red-700";
    }

    if (!coreStatus.value) {
      return "bg-gray-100 text-gray-600";
    }

    if (!coreStatus.value.installed) {
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
        : "Applying...";
    }

    if (!selectedCoreOption.value) {
      return "No Release Available";
    }

    if (
      selectedCoreOption.value.installed &&
      selectedCoreOption.value.is_active
    ) {
      return selectedCoreOption.value.channel === "testing"
        ? "Reinstall Testing"
        : "Reinstall Stable";
    }

    if (selectedCoreOption.value.installed) {
      return "Switch Core";
    }

    return "Install & Switch";
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
          "The requested sing-box release is unavailable or the downloaded package is invalid."
        );
      default:
        return fallback;
    }
  }

  async function applySelectedCore() {
    if (!selectedCoreOption.value || isUpdatingCore.value) {
      return;
    }

    isUpdatingCore.value = true;
    coreStatusError.value = "";
    coreUpdateProgress.value = {
      stage: "preparing",
      percent: 0,
      message: "Preparing the sing-box core action...",
    };

    try {
      if (selectedCoreOption.value.installed) {
        await activateSingboxCore(
          selectedCoreOption.value.channel,
          selectedCoreOption.value.version,
        );
        await appStore.setActiveSingboxCoreSelection(
          selectedCoreOption.value.channel,
          selectedCoreOption.value.version,
        );

        if (!selectedCoreOption.value.is_active) {
          toast.success(`Switched to ${selectedCoreOption.value.label}`);
        } else {
          const result: SingboxCoreUpdateResult = await updateSingboxCore(
            selectedCoreOption.value.channel,
            selectedCoreOption.value.version,
          );
          toast.success(
            result.restart_required
              ? `Sing-box core updated to ${result.current_version}. Restart sing-box to use the new core.`
              : `Sing-box core updated to ${result.current_version}`,
          );
        }
      } else {
        const result: SingboxCoreUpdateResult = await updateSingboxCore(
          selectedCoreOption.value.channel,
          selectedCoreOption.value.version,
        );
        toast.success(
          result.restart_required
            ? `Sing-box core updated to ${result.current_version}. Restart sing-box to use the new core.`
            : `Sing-box core updated to ${result.current_version}`,
        );
      }

      await appStore.setActiveSingboxCoreSelection(
        selectedCoreOption.value.channel,
        selectedCoreOption.value.version,
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

  watch(
    () => coreStatus.value?.available_options,
    (options) => {
      if (!options?.length) {
        selectedCoreOptionKey.value = "";
        return;
      }

      const currentExists = options.some(
        (option) => toOptionKey(option) === selectedCoreOptionKey.value,
      );
      if (currentExists) {
        return;
      }

      const activeOption = options.find((option) => option.is_active);
      selectedCoreOptionKey.value = toOptionKey(activeOption ?? options[0]);
    },
    { immediate: true },
  );

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
