import { onMounted, onUnmounted, watch } from "vue";
import { openAppDirectory } from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";
import { useConfigOverrideSettings } from "./settings/useConfigOverrideSettings";
import { useCoreUpdate } from "./settings/useCoreUpdate";
import { usePriorityConfig } from "./settings/usePriorityConfig";
import { useProcessManagement } from "./settings/useProcessManagement";

interface UseSettingsOptions {
  loadCustomerSettings?: boolean;
  autoRefreshCoreStatus?: boolean;
}

export function useSettings(options: UseSettingsOptions = {}) {
  const appStore = useAppStore();
  const { loadCustomerSettings = true, autoRefreshCoreStatus = false } =
    options;
  const prioritySettings = usePriorityConfig();
  const overrideSettings = useConfigOverrideSettings();
  const processManagement = useProcessManagement();
  const coreUpdate = useCoreUpdate({
    autoRefreshOnFirstMount: autoRefreshCoreStatus,
  });

  async function openApplicationDirectory() {
    try {
      await openAppDirectory();
    } catch (error) {
      toast.error(`Failed to open app directory: ${getErrorMessage(error)}`);
    }
  }

  async function initialize() {
    await Promise.all([
      overrideSettings.initializeOverride(),
      loadCustomerSettings
        ? prioritySettings.loadConfiguration()
        : Promise.resolve(),
    ]);
  }

  const handleWindowFocus = async () => {
    if (loadCustomerSettings) {
      await prioritySettings.loadConfiguration();
    }
  };

  if (loadCustomerSettings) {
    watch(
      () => appStore.selectedConfigPath.value,
      () => {
        void prioritySettings.loadConfiguration();
      },
    );
  }

  onMounted(() => {
    void initialize();
    window.addEventListener("focus", handleWindowFocus);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", handleWindowFocus);
  });

  return {
    ...prioritySettings,
    ...overrideSettings,
    ...processManagement,
    ...coreUpdate,
    openApplicationDirectory,
  };
}
