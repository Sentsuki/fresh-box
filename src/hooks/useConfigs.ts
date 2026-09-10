import { useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  addSubscription as addSubscriptionCmd,
  importProfileFile,
  importProfileData,
  exportProfile,
  deleteProfile as deleteProfileCmd,
  editSubscriptionUrl,
  listProfiles,
  openConfigFile as openConfigFileCmd,
  renameProfile as renameProfileCmd,
  setSubscriptionAutoUpdate,
  updateSubscription as updateSubscriptionCmd,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import { useConfigStore } from "../stores/configStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";
import { useToast } from "./useToast";
import { useSingbox } from "./useSingbox";
import type { ProfileEntry, ProfileOperationResult } from "../types/app";

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
  const { startService } = useSingbox();

  const initializeConfigs = useCallback(async () => {
    const config = useConfigStore.getState();
    config.setPending(true);
    try {
      const profiles = await listProfiles();
      config.setProfiles(profiles);

      const settings = useSettingsStore.getState();
      const savedId = settings.settings.profiles.selected_profile_id;
      const target =
        profiles.find((p) => p.id === savedId) ?? profiles[0] ?? null;
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
        // 直接再 start 一次 —— daemon 的 `StartService` 就是
        // `StartOrReloadService`，在同一把锁下原子换配置。以前这里要
        // stop→start 两次 RPC，中间隧道完全断开（审计项 H-02）。
        toastInfo("Applying the new config…");
        await startService({ reload: true });
      } else {
        toastSuccess(`Selected config: ${cfg.name}`);
      }
    },
    [toastInfo, toastSuccess, startService],
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

  /**
   * 导入别人分享的 `.bpf` —— sing-box 各端之间互传配置用的那个打包格式。
   *
   * 解包和校验都在 daemon 那边（`ApplicationService.DecodeProfile` +
   * `CheckConfig`），走的是 worker 自己的管道，所以服务没装也能导入。
   */
  const selectProfileFile = useCallback(async () => {
    const config = useConfigStore.getState();
    try {
      const file = await open({
        filters: [{ name: "sing-box profile", extensions: ["bpf"] }],
        multiple: false,
      });
      if (!file) return;

      config.setPending(true);
      try {
        const result = await importProfileData(file as string);
        await applyProfileResult(result);
        toastSuccess("Imported shared profile");
      } finally {
        config.setPending(false);
      }
    } catch (err) {
      toastError(`Error importing profile: ${getErrorMessage(err)}`);
    }
  }, [toastError, toastSuccess]);

  /** 反过来：把一份配置打包成可以发给别人的文件。 */
  const exportProfileFile = useCallback(
    async (id: string, name: string) => {
      try {
        const destination = await save({
          defaultPath: `${name.replace(/[^a-zA-Z0-9._-]/g, "-")}.bpf`,
          filters: [{ name: "sing-box profile", extensions: ["bpf"] }],
        });
        if (!destination) return;
        const written = await exportProfile(id, destination);
        toastSuccess("Profile exported", written);
      } catch (err) {
        toastError(`Error exporting profile: ${getErrorMessage(err)}`);
      }
    },
    [toastError, toastSuccess],
  );

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
        // 重载不在这里做：内容变了而且变的正好是当前跑着的那份时，后端的
        // `reload_if_selected_and_running` 已经就地重载完了。以前这条策略只
        // 写在前端，于是后台自动更新那条路径上它等于不存在 —— 新内容进了磁盘、
        // 隧道里跑的还是旧的（审计项 H-1）。
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
          intervalMinutes ?? null,
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
    selectProfileFile,
    exportProfileFile,
    addSubscription,
    updateSubscription,
    editSubscription,
    setAutoUpdate,
    renameConfig,
    deleteConfig,
    openConfigFile,
  };
}
