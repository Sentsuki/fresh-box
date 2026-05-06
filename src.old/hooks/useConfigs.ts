import { open } from "@tauri-apps/plugin-dialog";
import { fetch } from "@tauri-apps/plugin-http";
import {
  copyConfigToBin,
  deleteConfigFile,
  listConfigs,
  loadSubscriptions,
  openConfigFile as openConfigFileCommand,
  renameConfigFile,
  saveSubscriptionConfig,
  saveSubscriptions,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { getCleanFileName } from "../services/utils";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";
import type {
  ConfigFileEntry,
  SubscriptionInfo,
  SubscriptionRecord,
} from "../types/app";

function extractFileNameFromUrl(url: string): string {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  const originalName =
    pathname.substring(pathname.lastIndexOf("/") + 1) || "subscription";
  return originalName.endsWith(".json") ? originalName : `${originalName}.json`;
}

function buildConfigEntries(files: string[]): ConfigFileEntry[] {
  return files.map((path) => ({
    path,
    displayName: getCleanFileName(path),
  }));
}

function resolveSelectedConfig(preferredDisplayName?: string | null) {
  const state = useAppStore.getState();
  return (
    (preferredDisplayName &&
      state.configFiles.find(
        (config) => config.displayName === preferredDisplayName,
      )) ||
    (state.appSettings.app.selected_config_path &&
      state.configFiles.find(
        (config) => config.path === state.appSettings.app.selected_config_path,
      )) ||
    state.configFiles[0] ||
    null
  );
}

async function reconcileSelectedConfig(preferredDisplayName?: string | null) {
  const target = resolveSelectedConfig(preferredDisplayName);

  await useAppStore.getState().setSelectedConfig(
    target?.path ?? null,
    target?.displayName ?? null,
  );
}

async function persistSubscriptions(subscriptions: SubscriptionRecord) {
  await saveSubscriptions(subscriptions);
  useAppStore.getState().setSubscriptions(subscriptions);
}

async function syncConfigFiles(preferredDisplayName?: string | null) {
  const files = await listConfigs();
  useAppStore.getState().setConfigFiles(buildConfigEntries(files));
  await reconcileSelectedConfig(preferredDisplayName);
}

async function fetchSubscriptionContent(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.text();
}

function buildSubscriptionRecord(
  fileName: string,
  update: Partial<SubscriptionInfo>,
): SubscriptionRecord {
  const state = useAppStore.getState();
  return {
    ...state.subscriptions,
    [fileName]: {
      ...state.subscriptions[fileName],
      ...update,
    },
  };
}

function removeSubscriptionRecord(fileName: string): SubscriptionRecord {
  const state = useAppStore.getState();
  const nextSubscriptions = { ...state.subscriptions };
  delete nextSubscriptions[fileName];
  return nextSubscriptions;
}

function renameSubscriptionRecord(
  oldFileName: string,
  newFileName: string,
): SubscriptionRecord {
  const state = useAppStore.getState();
  const nextSubscriptions = { ...state.subscriptions };
  nextSubscriptions[newFileName] = nextSubscriptions[oldFileName];
  delete nextSubscriptions[oldFileName];
  return nextSubscriptions;
}

function hasDuplicateConfigName(oldFileName: string, newFileName: string) {
  const state = useAppStore.getState();
  return state.configFiles.some(
    (config) =>
      config.displayName === newFileName && config.displayName !== oldFileName,
  );
}

export function useConfigs() {
  async function loadConfigFiles(preferredDisplayName?: string | null) {
    await syncConfigFiles(preferredDisplayName);
  }

  async function initializeConfigs() {
    const store = useAppStore.getState();
    await store.withLoading(async () => {
      const [subscriptions, files] = await Promise.all([
        loadSubscriptions(),
        listConfigs(),
      ]);

      store.setSubscriptions(subscriptions);
      store.setConfigFiles(buildConfigEntries(files));
      await reconcileSelectedConfig(store.appSettings.app.selected_config_display);
    });
  }

  async function selectConfig(config: ConfigFileEntry) {
    const store = useAppStore.getState();
    if (store.isRunning) {
      toast.error(
        "Cannot change config while service is running. Stop the service first.",
      );
      return;
    }

    await store.setSelectedConfig(config.path, config.displayName);
    toast.success(`Selected config: ${config.displayName}`);
  }

  async function selectConfigFile() {
    const store = useAppStore.getState();
    try {
      const file = await open({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        multiple: false,
      });

      if (!file) {
        return;
      }

      await store.withLoading(async () => {
        await copyConfigToBin(file as string);
        await syncConfigFiles(getCleanFileName(file as string));
      });

      toast.success("Added config file successfully");
    } catch (error) {
      toast.error(`Error selecting config file: ${getErrorMessage(error)}`);
    }
  }

  async function addSubscription(url: string) {
    const store = useAppStore.getState();
    if (!url.trim() || store.pendingOperations > 0) {
      return;
    }

    try {
      await store.withLoading(async () => {
        const content = await fetchSubscriptionContent(url);
        const fileName = extractFileNameFromUrl(url);
        const targetPath = await saveSubscriptionConfig(fileName, content);
        const cleanFileName = getCleanFileName(targetPath);

        await persistSubscriptions(
          buildSubscriptionRecord(cleanFileName, {
            url,
            lastUpdated: new Date().toISOString(),
          }),
        );

        await syncConfigFiles(cleanFileName);
        toast.success(`Subscribed to: ${cleanFileName}`);
      });
    } catch (error) {
      toast.error(`Error adding subscription: ${getErrorMessage(error)}`);
    }
  }

  async function updateSubscription(fileName: string) {
    const store = useAppStore.getState();
    const subscription = store.subscriptions[fileName];
    if (!subscription || store.pendingOperations > 0) {
      return;
    }

    try {
      await store.withLoading(async () => {
        const content = await fetchSubscriptionContent(subscription.url);
        await saveSubscriptionConfig(`${fileName}.json`, content);

        await persistSubscriptions(
          buildSubscriptionRecord(fileName, {
            ...subscription,
            lastUpdated: new Date().toISOString(),
          }),
        );

        await syncConfigFiles(fileName);
      });

      toast.success(`Updated subscription: ${fileName}`);
    } catch (error) {
      toast.error(`Error updating subscription: ${getErrorMessage(error)}`);
    }
  }

  async function editSubscription(fileName: string, newUrl: string) {
    const store = useAppStore.getState();
    if (store.pendingOperations > 0) {
      return;
    }

    try {
      await store.withLoading(async () => {
        await persistSubscriptions(
          buildSubscriptionRecord(fileName, { url: newUrl }),
        );
      });

      toast.success(`Updated subscription URL for: ${fileName}`);
    } catch (error) {
      toast.error(`Error updating subscription URL: ${getErrorMessage(error)}`);
    }
  }

  async function renameConfig(oldFileName: string, newFileName: string) {
    const store = useAppStore.getState();
    if (store.pendingOperations > 0) {
      return;
    }

    if (hasDuplicateConfigName(oldFileName, newFileName)) {
      toast.error("A config with this name already exists");
      return;
    }

    try {
      await store.withLoading(async () => {
        await renameConfigFile(`${oldFileName}.json`, `${newFileName}.json`);

        if (store.subscriptions[oldFileName]) {
          await persistSubscriptions(
            renameSubscriptionRecord(oldFileName, newFileName),
          );
        }

        await syncConfigFiles(newFileName);
      });

      toast.success(`Renamed ${oldFileName} to ${newFileName}`);
    } catch (error) {
      toast.error(`Error renaming config: ${getErrorMessage(error)}`);
    }
  }

  async function deleteConfig(fileName: string) {
    const store = useAppStore.getState();
    if (store.pendingOperations > 0) {
      return;
    }

    const config = store.configFiles.find(
      (item) => item.displayName === fileName,
    );

    if (
      config?.path === store.appSettings.app.selected_config_path &&
      store.isRunning
    ) {
      toast.error(
        "Cannot delete active configuration. Stop the service first.",
      );
      return;
    }

    try {
      await store.withLoading(async () => {
        await deleteConfigFile(`${fileName}.json`);

        if (store.subscriptions[fileName]) {
          await persistSubscriptions(removeSubscriptionRecord(fileName));
        }

        await syncConfigFiles();
      });

      toast.success(`Deleted config: ${fileName}`);
    } catch (error) {
      toast.error(`Error deleting config: ${getErrorMessage(error)}`);
    }
  }

  async function openConfigFile(fileName: string) {
    try {
      await openConfigFileCommand(`${fileName}.json`);
    } catch (error) {
      toast.error(`Failed to open config file: ${getErrorMessage(error)}`);
    }
  }

  return {
    initializeConfigs,
    loadConfigFiles,
    selectConfig,
    selectConfigFile,
    addSubscription,
    updateSubscription,
    editSubscription,
    renameConfig,
    deleteConfig,
    openConfigFile,
  };
}
