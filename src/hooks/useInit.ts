import { useSettingsStore } from "../stores/settingsStore";
import { useConfigStore } from "../stores/configStore";
import { useAppStore } from "../stores/appStore";
import { listConfigs, loadSubscriptions } from "../services/api";
import { buildConfigEntries } from "../services/utils";

export async function initializeApp() {
  const settings = useSettingsStore.getState();
  const config = useConfigStore.getState();
  const app = useAppStore.getState();

  await settings.hydrate();

  // Whether sing-box is running, and everything that follows from that
  // (streams, the Overview data, ...) is handled by
  // `useDaemonConnectionListener` off the daemon's own state — not fetched
  // here, so this doesn't race it (see that hook's doc comment).
  const [files, subscriptions] = await Promise.all([
    listConfigs(),
    loadSubscriptions(),
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

  const savedPage = useSettingsStore.getState().settings.app.current_page;
  app.setCurrentPage(savedPage);
  app.markInitialized();
}

/** @deprecated Use `initializeApp()` directly instead. */
export function useInit() {
  return { initialize: initializeApp };
}
