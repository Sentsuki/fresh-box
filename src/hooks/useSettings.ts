import { useEffect, useCallback } from "react";
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
  const { loadCustomerSettings = true, autoRefreshCoreStatus = false } = options;
  
  const prioritySettings = usePriorityConfig();
  const overrideSettings = useConfigOverrideSettings();
  const processManagement = useProcessManagement();
  const coreUpdate = useCoreUpdate({
    autoRefreshOnFirstMount: autoRefreshCoreStatus,
  });

  const openApplicationDirectory = useCallback(async () => {
    try {
      await openAppDirectory();
    } catch (error) {
      toast.error(`Failed to open app directory: ${getErrorMessage(error)}`);
    }
  }, []);

  const initialize = useCallback(async () => {
    await Promise.all([
      overrideSettings.initializeOverride(),
      loadCustomerSettings
        ? prioritySettings.loadConfiguration()
        : Promise.resolve(),
    ]);
  }, [overrideSettings, loadCustomerSettings, prioritySettings]);

  useEffect(() => {
    const handleWindowFocus = async () => {
      if (loadCustomerSettings) {
        await prioritySettings.loadConfiguration();
      }
    };

    void initialize();
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCustomerSettings]); 

  useEffect(() => {
    if (loadCustomerSettings) {
      void prioritySettings.loadConfiguration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appStore.appSettings.app.selected_config_path, loadCustomerSettings]);

  return {
    ...prioritySettings,
    ...overrideSettings,
    ...processManagement,
    ...coreUpdate,
    openApplicationDirectory,
  };
}
