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
import { buildConfigEntries } from "../services/utils";
import { startConnectionsStream } from "./useConnectionsStream";
import { startLogsStream } from "./useLogsStream";
import { startTrafficStream } from "./useTrafficStream";
import { startMemoryStream } from "./useMemoryStream";

export async function initializeApp() {
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
    useSettingsStore.getState().settings.profiles.selected_config_display;
  const target =
    (savedDisplay && configFiles.find((c) => c.displayName === savedDisplay)) ||
    (useSettingsStore.getState().settings.profiles.selected_config_path &&
      configFiles.find(
        (c) =>
          c.path ===
          useSettingsStore.getState().settings.profiles.selected_config_path,
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
    void startLogsStream();
    await clash.refreshOverview(false);
  }

  const savedPage = useSettingsStore.getState().settings.app.current_page;
  app.setCurrentPage(savedPage);
  app.markInitialized();
}

/** @deprecated Use `initializeApp()` directly instead. */
export function useInit() {
  return { initialize: initializeApp };
}
