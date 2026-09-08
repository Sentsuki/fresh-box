import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addSubscription as addSubscriptionCmd,
  importProfileFile,
  deleteProfile as deleteProfileCmd,
  editSubscriptionUrl,
  listProfiles,
  openConfigFile as openConfigFileCmd,
  renameProfile as renameProfileCmd,
  setSubscriptionAutoUpdate,
  updateSubscription as updateSubscriptionCmd,
  type ProfileOperationResult,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useConfigStore } from "../stores/configStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";
import { useToast } from "./useToast";
import { useSingbox } from "./useSingbox";
import type { ProfileEntry } from "../types/app";

/** Subscription content fetched over plain HTTP isn't encrypted or
 * authenticated in transit, so it can be tampered with in flight (and, per
 * the backend's config validation, a tampered response now just fails to
 * save instead of silently applying — but the transport is still worth
 * flagging to the user up front). */
function isInsecureSubscriptionUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("http://");
}

/**
 * Apply a freshly-fetched profile list to the store, and re-resolve the
 * persisted selection against it: kept as-is if the currently selected
 * path still exists in the new list (renaming/deleting/importing some
 * *other* profile shouldn't disturb it), otherwise falls back to
 * `preferredName` (typically whatever profile the caller just
 * added/renamed) or the first profile.
 */
async function applyProfiles(
  profiles: ProfileEntry[],
  preferredId?: string | null,
) {
  useConfigStore.getState().setProfiles(profiles);

  const settings = useSettingsStore.getState();
  const currentId = settings.settings.profiles.selected_profile_id;
  if (currentId && profiles.some((p) => p.id === currentId)) {
    return;
  }

  const target =
    (preferredId && profiles.find((p) => p.id === preferredId)) ||
    profiles[0] ||
    null;

  await settings.setSelectedProfile(target?.id ?? null);
}

async function applyProfileResult(result: ProfileOperationResult) {
  await applyProfiles(result.profiles, result.entry.id);
}

export function useConfigs() {
  const {
    error: toastError,
    success: toastSuccess,
    info: toastInfo,
    warning: toastWarning,
  } = useToast();
  const { startService, stopService } = useSingbox();

  const initializeConfigs = useCallback(async () => {
    const config = useConfigStore.getState();
    config.setPending(true);
    try {
      const profiles = await listProfiles();
      config.setProfiles(profiles);

      const settings = useSettingsStore.getState();
      const savedId = settings.settings.profiles.selected_profile_id;
      const target = profiles.find((p) => p.id === savedId) ?? profiles[0] ?? null;
      await settings.setSelectedProfile(target?.id ?? null);
    } finally {
      config.setPending(false);
    }
  }, []);

  const selectConfig = useCallback(
    async (cfg: ProfileEntry) => {
      const settings = useSettingsStore.getState();
      const singbox = useSingboxStore.getState();

      await settings.setSelectedProfile(cfg.id);

      if (singbox.isRunning) {
        toastInfo("Config changed. Restarting service...");
        await stopService();
        await startService();
      } else {
        toastSuccess(`Selected config: ${cfg.name}`);
      }
    },
    [toastInfo, toastSuccess, stopService, startService],
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
        const result = await importProfileFile(file as string);
        await applyProfileResult(result);
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
      if (!url.trim() || config.pendingOperation) return false;

      config.setPending(true);
      try {
        const result = await addSubscriptionCmd(url);
        await applyProfileResult(result);
        toastSuccess(`Subscribed to: ${result.entry.name}`);
        if (isInsecureSubscriptionUrl(url)) {
          toastWarning(
            "This subscription uses plain HTTP",
            "Its content isn't encrypted in transit and could be tampered with. Use an HTTPS URL if the provider offers one.",
          );
        }
        return true;
      } catch (err) {
        toastError(`Error adding subscription: ${getErrorMessage(err)}`);
        return false;
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess, toastWarning],
  );

  const updateSubscription = useCallback(
    async (id: string) => {
      const config = useConfigStore.getState();
      const profile = config.profiles.find((p) => p.id === id);
      if (!profile?.url || config.pendingOperation) return false;

      config.setPending(true);
      try {
        const result = await updateSubscriptionCmd(id);
        await applyProfileResult(result);
        toastSuccess(`Updated subscription: ${result.entry.name}`);
        return true;
      } catch (err) {
        toastError(`Error updating subscription: ${getErrorMessage(err)}`);
        return false;
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const editSubscription = useCallback(
    async (id: string, newUrl: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      config.setPending(true);
      try {
        const profiles = await editSubscriptionUrl(id, newUrl);
        useConfigStore.getState().setProfiles(profiles);
        toastSuccess("Updated subscription URL");
        if (isInsecureSubscriptionUrl(newUrl)) {
          toastWarning(
            "This subscription uses plain HTTP",
            "Its content isn't encrypted in transit and could be tampered with. Use an HTTPS URL if the provider offers one.",
          );
        }
      } catch (err) {
        toastError(`Error updating subscription URL: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess, toastWarning],
  );

  const setAutoUpdate = useCallback(
    async (id: string, enabled: boolean, intervalMinutes?: number) => {
      try {
        const profiles = await setSubscriptionAutoUpdate(
          id,
          enabled,
          intervalMinutes,
        );
        useConfigStore.getState().setProfiles(profiles);
      } catch (err) {
        toastError(
          `Error updating auto-update setting: ${getErrorMessage(err)}`,
        );
      }
    },
    [toastError],
  );

  const renameConfig = useCallback(
    async (id: string, newName: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      const current = config.profiles.find((p) => p.id === id);
      const duplicate = config.profiles.some(
        (p) => p.name === newName && p.id !== id,
      );
      if (duplicate) {
        toastError("A config with this name already exists");
        return;
      }

      config.setPending(true);
      try {
        const profiles = await renameProfileCmd(id, newName);
        await applyProfiles(profiles, id);
        toastSuccess(`Renamed ${current?.name ?? id} to ${newName}`);
      } catch (err) {
        toastError(`Error renaming config: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const deleteConfig = useCallback(
    async (id: string) => {
      const config = useConfigStore.getState();
      if (config.pendingOperation) return;

      const cfg = config.profiles.find((p) => p.id === id);
      const settings = useSettingsStore.getState();
      if (
        cfg?.id === settings.settings.profiles.selected_profile_id &&
        useSingboxStore.getState().isRunning
      ) {
        toastError(
          "Cannot delete active configuration. Stop the service first.",
        );
        return;
      }

      config.setPending(true);
      try {
        const profiles = await deleteProfileCmd(id);
        await applyProfiles(profiles);
        toastSuccess(`Deleted config: ${cfg?.name ?? id}`);
      } catch (err) {
        toastError(`Error deleting config: ${getErrorMessage(err)}`);
      } finally {
        config.setPending(false);
      }
    },
    [toastError, toastSuccess],
  );

  const openConfigFile = useCallback(
    async (id: string) => {
      try {
        await openConfigFileCmd(id);
      } catch (err) {
        toastError(`Failed to open config file: ${getErrorMessage(err)}`);
      }
    },
    [toastError],
  );

  return {
    initializeConfigs,
    selectConfig,
    selectConfigFile,
    addSubscription,
    updateSubscription,
    editSubscription,
    setAutoUpdate,
    renameConfig,
    deleteConfig,
    openConfigFile,
  };
}
