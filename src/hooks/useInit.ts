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

  // 选中的是档案 **id**：内容文件按 UUID 命名，路径已经不是身份了。
  const savedId = useSettingsStore.getState().settings.profiles.selected_profile_id;
  const target = profiles.find((p) => p.id === savedId) ?? profiles[0] ?? null;
  await settings.setSelectedProfile(target?.id ?? null);

  const savedPage = useSettingsStore.getState().settings.app.current_page;
  app.setInitialPage(savedPage);
  app.markInitialized();
}
