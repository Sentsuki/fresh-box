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
  const selectedConfigPath = useAppStore((state) => state.appSettings.app.selected_config_path);
  const { loadCustomerSettings = true, autoRefreshCoreStatus = false } = options;
  
  const prioritySettings = usePriorityConfig();
  const overrideSettings = useConfigOverrideSettings();
  const processManagement = useProcessManagement();
  const coreUpdate = useCoreUpdate({
    autoRefreshOnFirstMount: autoRefreshCoreStatus,
  });
  const loadPriorityConfiguration = prioritySettings.loadConfiguration;
  const initializeOverride = overrideSettings.initializeOverride;

  const openApplicationDirectory = useCallback(async () => {
    try {
      await openAppDirectory();
    } catch (error) {
      toast.error(`Failed to open app directory: ${getErrorMessage(error)}`);
    }
  }, []);

  const initialize = useCallback(async () => {
    await Promise.all([
      initializeOverride(),
      loadCustomerSettings
        ? loadPriorityConfiguration()
        : Promise.resolve(),
    ]);
  }, [initializeOverride, loadCustomerSettings, loadPriorityConfiguration]);

  useEffect(() => {
    const handleWindowFocus = async () => {
      if (loadCustomerSettings) {
        await loadPriorityConfiguration();
      }
    };

    void initialize();
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [initialize, loadCustomerSettings, loadPriorityConfiguration]);

  useEffect(() => {
    if (loadCustomerSettings) {
      void loadPriorityConfiguration();
    }
  }, [loadCustomerSettings, loadPriorityConfiguration, selectedConfigPath]);

  return {
    ...prioritySettings,
    ...overrideSettings,
    ...processManagement,
    ...coreUpdate,
    openApplicationDirectory,
  };
}
