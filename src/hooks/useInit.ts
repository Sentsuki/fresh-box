import { useSettingsStore } from "../stores/settingsStore";
import { useConfigStore } from "../stores/configStore";
import { useAppStore } from "../stores/appStore";
import { listProfiles } from "../services/api";

export async function initializeApp() {
  const settings = useSettingsStore.getState();
  const config = useConfigStore.getState();
  const app = useAppStore.getState();

  await settings.hydrate();

  // Whether sing-box is running, and everything that follows from that
  // (streams, the Overview data, ...) is handled by
  // `useDaemonConnectionListener` off the daemon's own state — not fetched
  // here, so this doesn't race it (see that hook's doc comment).
  const profiles = await listProfiles();
  config.setProfiles(profiles);

  const savedDisplay =
    useSettingsStore.getState().settings.profiles.selected_config_display;
  const savedPath =
    useSettingsStore.getState().settings.profiles.selected_config_path;
  const target =
    (savedDisplay && profiles.find((p) => p.name === savedDisplay)) ||
    (savedPath && profiles.find((p) => p.path === savedPath)) ||
    profiles[0] ||
    null;

  await settings.setSelectedConfig(target?.path ?? null, target?.name ?? null);

  const savedPage = useSettingsStore.getState().settings.app.current_page;
  app.setInitialPage(savedPage);
  app.markInitialized();
}
