import { useSettingsStore } from "../stores/settingsStore";
import { useSingboxStore } from "../stores/singboxStore";
import { useClashStore } from "../stores/clashStore";
import { useConfigStore } from "../stores/configStore";
import { useAppStore } from "../stores/appStore";
import {
  isSingboxRunning,
  listConfigs,
  loadSubscriptions,
} from "../services/api";
import { getCleanFileName } from "../services/utils";
import type { ConfigFileEntry } from "../types/app";
import { startConnectionsStream } from "./useConnectionsStream";
import { startTrafficStream } from "./useTrafficStream";
import { startMemoryStream } from "./useMemoryStream";

function buildConfigEntries(files: string[]): ConfigFileEntry[] {
  return files.map((path) => ({
    path,
    displayName: getCleanFileName(path),
  }));
}

export function useInit() {
  async function initialize() {
    const settings = useSettingsStore.getState();
    const singbox = useSingboxStore.getState();
    const clash = useClashStore.getState();
    const config = useConfigStore.getState();
    const app = useAppStore.getState();

    await settings.hydrate();

    const [files, subscriptions, running] = await Promise.all([
      listConfigs(),
      loadSubscriptions(),
      isSingboxRunning(),
    ]);

    const configFiles = buildConfigEntries(files);
    config.setConfigFiles(configFiles);
    config.setSubscriptions(subscriptions);

    const savedDisplay =
      useSettingsStore.getState().settings.Profiles.selected_config_display;
    const target =
      (savedDisplay &&
        configFiles.find((c) => c.displayName === savedDisplay)) ||
      (useSettingsStore.getState().settings.Profiles.selected_config_path &&
        configFiles.find(
          (c) =>
            c.path ===
            useSettingsStore.getState().settings.Profiles.selected_config_path,
        )) ||
      configFiles[0] ||
      null;

    await settings.setSelectedConfig(
      target?.path ?? null,
      target?.displayName ?? null,
    );

    singbox.setRunning(running);
    if (running) {
      startConnectionsStream();
      startTrafficStream();
      startMemoryStream();
      await clash.refreshOverview(false);
    }

    // sync currentPage from persisted settings
    const savedPage = useSettingsStore.getState().settings.app.current_page;
    app.setCurrentPage(savedPage);
    app.markInitialized();
  }

  return { initialize };
}
