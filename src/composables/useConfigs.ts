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

const appStore = useAppStore();

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
  return (
    (preferredDisplayName &&
      appStore.configFiles.value.find(
        (config) => config.displayName === preferredDisplayName,
      )) ||
    (appStore.selectedConfigPath.value &&
      appStore.configFiles.value.find(
        (config) => config.path === appStore.selectedConfigPath.value,
      )) ||
    appStore.configFiles.value[0] ||
    null
  );
}

async function reconcileSelectedConfig(preferredDisplayName?: string | null) {
  const target = resolveSelectedConfig(preferredDisplayName);

  await appStore.setSelectedConfig(
    target?.path ?? null,
    target?.displayName ?? null,
  );
}

async function persistSubscriptions(subscriptions: SubscriptionRecord) {
  await saveSubscriptions(subscriptions);
  appStore.setSubscriptions(subscriptions);
}

async function syncConfigFiles(preferredDisplayName?: string | null) {
  const files = await listConfigs();
  appStore.setConfigFiles(buildConfigEntries(files));
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
  return {
    ...appStore.subscriptions.value,
    [fileName]: {
      ...appStore.subscriptions.value[fileName],
      ...update,
    },
  };
}

function removeSubscriptionRecord(fileName: string): SubscriptionRecord {
  const nextSubscriptions = { ...appStore.subscriptions.value };
  delete nextSubscriptions[fileName];
  return nextSubscriptions;
}

function renameSubscriptionRecord(
  oldFileName: string,
  newFileName: string,
): SubscriptionRecord {
  const nextSubscriptions = { ...appStore.subscriptions.value };
  nextSubscriptions[newFileName] = nextSubscriptions[oldFileName];
  delete nextSubscriptions[oldFileName];
  return nextSubscriptions;
}

function hasDuplicateConfigName(oldFileName: string, newFileName: string) {
  return appStore.configFiles.value.some(
    (config) =>
      config.displayName === newFileName && config.displayName !== oldFileName,
  );
}

export function useConfigs() {
  async function loadConfigFiles(preferredDisplayName?: string | null) {
    await syncConfigFiles(preferredDisplayName);
  }

  async function initializeConfigs() {
    await appStore.withLoading(async () => {
      await appStore.hydrateSettings();

      const [subscriptions, files] = await Promise.all([
        loadSubscriptions(),
        listConfigs(),
      ]);

      appStore.setSubscriptions(subscriptions);
      appStore.setConfigFiles(buildConfigEntries(files));
      await reconcileSelectedConfig(appStore.selectedConfigDisplay.value);
    });
  }

  async function selectConfig(config: ConfigFileEntry) {
    if (appStore.isRunning.value) {
      toast.error(
        "Cannot change config while service is running. Stop the service first.",
      );
      return;
    }

    await appStore.setSelectedConfig(config.path, config.displayName);
    toast.success(`Selected config: ${config.displayName}`);
  }

  async function selectConfigFile() {
    try {
      const file = await open({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        multiple: false,
      });

      if (!file) {
        return;
      }

      await appStore.withLoading(async () => {
        await copyConfigToBin(file as string);
        await syncConfigFiles(getCleanFileName(file as string));
      });

      toast.success("Added config file successfully");
    } catch (error) {
      toast.error(`Error selecting config file: ${getErrorMessage(error)}`);
    }
  }

  async function addSubscription(url: string) {
    if (!url.trim() || appStore.isLoading.value) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
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
    const subscription = appStore.subscriptions.value[fileName];
    if (!subscription || appStore.isLoading.value) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
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
    if (appStore.isLoading.value) {
      return;
    }

    try {
      await appStore.withLoading(async () => {
        await persistSubscriptions(buildSubscriptionRecord(fileName, { url: newUrl }));
      });

      toast.success(`Updated subscription URL for: ${fileName}`);
    } catch (error) {
      toast.error(`Error updating subscription URL: ${getErrorMessage(error)}`);
    }
  }

  async function renameConfig(oldFileName: string, newFileName: string) {
    if (appStore.isLoading.value) {
      return;
    }

    if (hasDuplicateConfigName(oldFileName, newFileName)) {
      toast.error("A config with this name already exists");
      return;
    }

    try {
      await appStore.withLoading(async () => {
        await renameConfigFile(`${oldFileName}.json`, `${newFileName}.json`);

        if (appStore.subscriptions.value[oldFileName]) {
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
    if (appStore.isLoading.value) {
      return;
    }

    const config = appStore.configFiles.value.find(
      (item) => item.displayName === fileName,
    );

    if (
      config?.path === appStore.selectedConfigPath.value &&
      appStore.isRunning.value
    ) {
      toast.error(
        "Cannot delete active configuration. Stop the service first.",
      );
      return;
    }

    try {
      await appStore.withLoading(async () => {
        await deleteConfigFile(`${fileName}.json`);

        if (appStore.subscriptions.value[fileName]) {
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
