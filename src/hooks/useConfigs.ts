import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { fetch } from "@tauri-apps/plugin-http";
import {
  copyConfigToBin,
  deleteConfigFile,
  listConfigs,
  loadSubscriptions,
  openConfigFile as openConfigFileCmd,
  renameConfigFile,
  saveSubscriptionConfig,
  saveSubscriptions,
} from "../services/api";
import { getCleanFileName } from "../services/utils";
import { getErrorMessage } from "../services/tauri";
import { useConfigStore } from "../stores/configStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";
import { useToast } from "./useToast";
import type { ConfigFileEntry, SubscriptionInfo, SubscriptionRecord } from "../types/app";

function buildConfigEntries(files: string[]): ConfigFileEntry[] {
  return files.map((path) => ({
    path,
    displayName: getCleanFileName(path),
  }));
}

async function syncConfigFiles(preferredDisplayName?: string | null) {
  const files = await listConfigs();
  const configFiles = buildConfigEntries(files);
  useConfigStore.getState().setConfigFiles(configFiles);

  const settings = useSettingsStore.getState();
  const currentPath = settings.settings.app.selected_config_path;

  // Keep current selection if it still exists in the new list
  if (currentPath && configFiles.find((c) => c.path === currentPath)) {
    return;
  }

  // Current selection is gone (deleted/renamed); fall back to preferredDisplayName or first file
  const target =
    (preferredDisplayName &&
      configFiles.find((c) => c.displayName === preferredDisplayName)) ||
    configFiles[0] ||
    null;

  await settings.setSelectedConfig(
    target?.path ?? null,
    target?.displayName ?? null,
  );
}

async function persistSubscriptions(subscriptions: SubscriptionRecord) {
  await saveSubscriptions(subscriptions);
  useConfigStore.getState().setSubscriptions(subscriptions);
}

function extractFileNameFromUrl(url: string): string {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  const originalName =
    pathname.substring(pathname.lastIndexOf("/") + 1) || "subscription";
  return originalName.endsWith(".json") ? originalName : `${originalName}.json`;
}

async function fetchSubscriptionContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.text();
}

export function useConfigs() {
  const { error: toastError, success: toastSuccess } = useToast();

  const initializeConfigs = useCallback(async () => {
    const config = useConfigStore.getState();
    config.setPending(true);
    try {
      const [files, subscriptions] = await Promise.all([
        listConfigs(),
        loadSubscriptions(),
      ]);
      const configFiles = buildConfigEntries(files);
      config.setConfigFiles(configFiles);
      config.setSubscriptions(subscriptions);

      const settings = useSettingsStore.getState();
      const savedDisplay = settings.settings.app.selected_config_display;
      const target =
        (savedDisplay &&
          configFiles.find((c) => c.displayName === savedDisplay)) ||
        (settings.settings.app.selected_config_path &&
          configFiles.find(
            (c) => c.path === settings.settings.app.selected_config_path,
          )) ||
        configFiles[0] ||
        null;

      await settings.setSelectedConfig(
        target?.path ?? null,
        target?.displayName ?? null,
      );
    } finally {
      config.setPending(false);
    }
  }, []);

  const selectConfig = useCallback(
    async (cfg: ConfigFileEntry) => {
      if (useSingboxStore.getState().isRunning) {
        toastError(
          "Cannot change config while service is running. Stop the service first.",
        );
        return;
      }
      await useSettingsStore
        .getState()
        .setSelectedConfig(cfg.path, cfg.displayName);
      toastSuccess(`Selected config: ${cfg.displayName}`);
    },
    [toastError, toastSuccess],
  );

  const selectConfigFile = useCallback(async () => {
    const config = useConfigStore.getState();
    try {
      const file = await open({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        multiple: false,
      });
      if (!file) return;

      config.setPending(true);
      try {
        await copyConfigToBin(file as string);
        await syncConfigFiles(getCleanFileName(file as string));
        toastSuccess("Added config file successfully");
      } finally {
        config.setPending(false);
      }
    } catch (err) {
      toastError(`Error selecting config file: ${getErrorMessage(err)}`);
    }
  }, [toastError, toastSuccess]);

  const addSubscription = useCallback(
    async (url: string) => {
      const config = useConfigStore.getState();
      if (!url.trim() || config.pendingOperation) return;

      config.setPending(true);
      try {
        const content = await fetchSubscriptionContent(url);
        const fileName = extractFileNameFromUrl(url);
        const targetPath = await saveSubscriptionConfig(fileName, content);
        const cleanFileName = getCleanFileName(targetPath);

        const current = useConfigStore.getState().subscriptions;
        await persistSubscriptions({
          ...current,
          [cleanFileName]: {
            ...current[cleanFileName],
            url,
            lastUpdated: new Date().toISOString(),
          },
        });

        await syncConfigFiles(cleanFileName);
        toastSuccess(`Subscribed to: ${cleanFileName}`);
      } catch (err) {
        toastError(`Error adding subscription: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const updateSubscription = useCallback(
    async (fileName: string) => {
      const config = useConfigStore.getState();
      const subscription = config.subscriptions[fileName];
      if (!subscription || config.pendingOperation) return;

      config.setPending(true);
      try {
        const content = await fetchSubscriptionContent(subscription.url);
        await saveSubscriptionConfig(`${fileName}.json`, content);
        await persistSubscriptions({
          ...config.subscriptions,
          [fileName]: {
            ...subscription,
            lastUpdated: new Date().toISOString(),
          },
        });
        await syncConfigFiles(fileName);
        toastSuccess(`Updated subscription: ${fileName}`);
      } catch (err) {
        toastError(`Error updating subscription: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const editSubscription = useCallback(
    async (fileName: string, newUrl: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      config.setPending(true);
      try {
        const current = config.subscriptions;
        await persistSubscriptions({
          ...current,
          [fileName]: { ...current[fileName], url: newUrl },
        });
        toastSuccess(`Updated subscription URL for: ${fileName}`);
      } catch (err) {
        toastError(`Error updating subscription URL: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const renameConfig = useCallback(
    async (oldFileName: string, newFileName: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      const duplicate = config.configFiles.some(
        (c) =>
          c.displayName === newFileName && c.displayName !== oldFileName,
      );
      if (duplicate) {
        toastError("A config with this name already exists");
        return;
      }

      config.setPending(true);
      try {
        await renameConfigFile(`${oldFileName}.json`, `${newFileName}.json`);
        if (config.subscriptions[oldFileName]) {
          const next = { ...config.subscriptions };
          next[newFileName] = next[oldFileName];
          delete next[oldFileName];
          await persistSubscriptions(next);
        }
        await syncConfigFiles(newFileName);
        toastSuccess(`Renamed ${oldFileName} to ${newFileName}`);
      } catch (err) {
        toastError(`Error renaming config: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const deleteConfig = useCallback(
    async (fileName: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      const cfg = config.configFiles.find((c) => c.displayName === fileName);
      const settings = useSettingsStore.getState();
      if (
        cfg?.path === settings.settings.app.selected_config_path &&
        useSingboxStore.getState().isRunning
      ) {
        toastError("Cannot delete active configuration. Stop the service first.");
        return;
      }

      config.setPending(true);
      try {
        await deleteConfigFile(`${fileName}.json`);
        if (config.subscriptions[fileName]) {
          const next = { ...config.subscriptions };
          delete next[fileName];
          await persistSubscriptions(next);
        }
        await syncConfigFiles();
        toastSuccess(`Deleted config: ${fileName}`);
      } catch (err) {
        toastError(`Error deleting config: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const openConfigFile = useCallback(
    async (fileName: string) => {
      try {
        await openConfigFileCmd(`${fileName}.json`);
      } catch (err) {
        toastError(`Failed to open config file: ${getErrorMessage(err)}`);
      }
    },
    [toastError],
  );

  const loadConfigFiles = useCallback(
    async (preferredDisplayName?: string | null) => {
      await syncConfigFiles(preferredDisplayName);
    },
    [],
  );

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

export type { SubscriptionInfo };
