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
import { toSafeFileName } from "../services/utils";
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

  /**
   * 档案操作的共同骨架：失败统一弹「前缀: 原因」，返回是否成功。
   *
   * `exclusive` 的操作同一时间只允许一个 —— 由 `pendingOperation` 把守，它
   * 也是「添加订阅」弹窗禁用按钮的依据。只读的或者互不干扰的操作（打开文件、
   * 导出、改自动更新）不占这把锁。
   */
  const run = useCallback(
    async (
      errorPrefix: string,
      action: () => Promise<void>,
      { exclusive = true } = {},
    ): Promise<boolean> => {
      const config = useConfigStore.getState();
      if (exclusive) {
        if (config.pendingOperation) return false;
        config.setPending(true);
      }
      try {
        await action();
        return true;
      } catch (err) {
        toastError(`${errorPrefix}: ${getErrorMessage(err)}`);
        return false;
      } finally {
        if (exclusive) config.setPending(false);
      }
    },
    [toastError],
  );

  const warnIfInsecure = useCallback(
    (url: string) => {
      if (isInsecureSubscriptionUrl(url)) {
        toastWarning(
          "This subscription uses plain HTTP",
          "Its content isn't encrypted in transit and could be tampered with. Use an HTTPS URL if the provider offers one.",
        );
      }
    },
    [toastWarning],
  );

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
    await run("Error selecting config file", async () => {
      const file = await open({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        multiple: false,
      });
      if (!file) return;
      await applyProfileResult(await importProfileFile(file as string));
      toastSuccess("Added config file successfully");
    });
  }, [run, toastSuccess]);

  /**
   * 导入别人分享的 `.bpf` —— sing-box 各端之间互传配置用的那个打包格式。
   *
   * 解包和校验都在 daemon 那边（`ApplicationService.DecodeProfile` +
   * `CheckConfig`），走的是 worker 自己的管道，所以服务没装也能导入。
   */
  const selectProfileFile = useCallback(async () => {
    await run("Error importing profile", async () => {
      const file = await open({
        filters: [{ name: "sing-box profile", extensions: ["bpf"] }],
        multiple: false,
      });
      if (!file) return;
      await applyProfileResult(await importProfileData(file as string));
      toastSuccess("Imported shared profile");
    });
  }, [run, toastSuccess]);

  /** 反过来：把一份配置打包成可以发给别人的文件。 */
  const exportProfileFile = useCallback(
    async (id: string, name: string) => {
      await run(
        "Error exporting profile",
        async () => {
          const destination = await save({
            defaultPath: `${toSafeFileName(name)}.bpf`,
            filters: [{ name: "sing-box profile", extensions: ["bpf"] }],
          });
          if (!destination) return;
          const written = await exportProfile(id, destination);
          toastSuccess("Profile exported", written);
        },
        { exclusive: false },
      );
    },
    [run, toastSuccess],
  );

  const addSubscription = useCallback(
    async (url: string) => {
      if (!url.trim()) return false;
      return run("Error adding subscription", async () => {
        const result = await addSubscriptionCmd(url);
        await applyProfileResult(result);
        toastSuccess(`Subscribed to: ${result.entry.name}`);
        warnIfInsecure(url);
      });
    },
    [run, toastSuccess, warnIfInsecure],
  );

  const updateSubscription = useCallback(
    async (id: string) => {
      const profile = useConfigStore
        .getState()
        .profiles.find((p) => p.id === id);
      if (!profile?.url) return false;
      return run("Error updating subscription", async () => {
        const result = await updateSubscriptionCmd(id);
        await applyProfileResult(result);
        // 重载不在这里做：内容变了而且变的正好是当前跑着的那份时，后端的
        // `reload_if_selected_and_running` 已经就地重载完了。以前这条策略只
        // 写在前端，于是后台自动更新那条路径上它等于不存在 —— 新内容进了磁盘、
        // 隧道里跑的还是旧的（审计项 H-1）。
        toastSuccess(`Updated subscription: ${result.entry.name}`);
      });
    },
    [run, toastSuccess],
  );

  const editSubscription = useCallback(
    async (id: string, newUrl: string) => {
      await run("Error updating subscription URL", async () => {
        const profiles = await editSubscriptionUrl(id, newUrl);
        useConfigStore.getState().setProfiles(profiles);
        toastSuccess("Updated subscription URL");
        warnIfInsecure(newUrl);
      });
    },
    [run, toastSuccess, warnIfInsecure],
  );

  const setAutoUpdate = useCallback(
    async (id: string, enabled: boolean, intervalMinutes?: number) => {
      await run(
        "Error updating auto-update setting",
        async () => {
          const profiles = await setSubscriptionAutoUpdate(
            id,
            enabled,
            intervalMinutes ?? null,
          );
          useConfigStore.getState().setProfiles(profiles);
        },
        { exclusive: false },
      );
    },
    [run],
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

      await run("Error renaming config", async () => {
        const profiles = await renameProfileCmd(id, newName);
        await applyProfiles(profiles, id);
        toastSuccess(`Renamed ${current?.name ?? id} to ${newName}`);
      });
    },
    [run, toastError, toastSuccess],
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

      await run("Error deleting config", async () => {
        const profiles = await deleteProfileCmd(id);
        await applyProfiles(profiles);
        toastSuccess(`Deleted config: ${cfg?.name ?? id}`);
      });
    },
    [run, toastError, toastSuccess],
  );

  const openConfigFile = useCallback(
    async (id: string) => {
      await run(
        "Failed to open config file",
        () => openConfigFileCmd(id).then(() => {}),
        { exclusive: false },
      );
    },
    [run],
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
