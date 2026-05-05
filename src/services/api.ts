import { invokeCommand } from "./tauri";
import type {
  AppSettings,
  ConfigFieldsCheck,
  ConfigOverride,
  PriorityConfig,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
  SubscriptionInfo,
  SubscriptionRecord,
} from "../types/app";

function normalizeSubscriptions(
  parsed: Record<string, SubscriptionInfo | string>,
): SubscriptionRecord {
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      typeof value === "string" ? { url: value } : value,
    ]),
  );
}

export async function listConfigs(): Promise<string[]> {
  return invokeCommand<string[]>("list_configs");
}

export async function copyConfigToBin(configPath: string): Promise<string> {
  return invokeCommand<string>("copy_config_to_bin", { configPath });
}

export async function saveSubscriptionConfig(
  fileName: string,
  content: string,
): Promise<string> {
  return invokeCommand<string>("save_subscription_config", {
    fileName,
    content,
  });
}

export async function renameConfigFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  return invokeCommand<void>("rename_config", { oldPath, newPath });
}

export async function deleteConfigFile(configPath: string): Promise<void> {
  return invokeCommand<void>("delete_config", { configPath });
}

export async function openConfigFile(configPath: string): Promise<void> {
  return invokeCommand<void>("open_config_file", { configPath });
}

export async function loadSubscriptions(): Promise<SubscriptionRecord> {
  const raw = await invokeCommand<string>("load_subscriptions");
  if (!raw) {
    return {};
  }

  return normalizeSubscriptions(
    JSON.parse(raw) as Record<string, SubscriptionInfo | string>,
  );
}

export async function saveSubscriptions(
  subscriptions: SubscriptionRecord,
): Promise<void> {
  return invokeCommand<void>("save_subscriptions", {
    subscriptions: JSON.stringify(subscriptions),
  });
}

export async function loadAppSettings(): Promise<AppSettings> {
  const settings =
    await invokeCommand<Partial<AppSettings>>("load_app_settings");

  return {
    selected_config: settings.selected_config ?? null,
    selected_config_display: settings.selected_config_display ?? null,
    current_page: settings.current_page ?? null,
    active_singbox_core_version: settings.active_singbox_core_version ?? null,
  };
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return invokeCommand<void>("save_app_settings", { settings });
}

export async function startSingbox(configPath: string): Promise<void> {
  return invokeCommand<void>("start_singbox", { configPath });
}

export async function stopSingbox(): Promise<void> {
  return invokeCommand<void>("stop_singbox");
}

export async function isSingboxRunning(): Promise<boolean> {
  return invokeCommand<boolean>("is_singbox_running");
}

export async function getSingboxStatus(): Promise<string> {
  return invokeCommand<string>("get_singbox_status");
}

export async function refreshSingboxDetection(): Promise<boolean> {
  return invokeCommand<boolean>("refresh_singbox_detection");
}

export async function getClashApiUrl(
  configPath: string,
): Promise<string | null> {
  return invokeCommand<string | null>("get_clash_api_url", { configPath });
}

export async function openUrl(url: string): Promise<void> {
  return invokeCommand<void>("open_url", { url });
}

export async function enableConfigOverride(): Promise<void> {
  return invokeCommand<void>("enable_config_override");
}

export async function disableConfigOverride(): Promise<void> {
  return invokeCommand<void>("disable_config_override");
}

export async function loadConfigOverride(): Promise<ConfigOverride> {
  return invokeCommand<ConfigOverride>("load_config_override");
}

export async function saveConfigOverride(
  config: ConfigOverride,
): Promise<void> {
  return invokeCommand<void>("save_config_override", { config });
}

export async function clearConfigOverride(): Promise<void> {
  return invokeCommand<void>("clear_config_override");
}

export async function isConfigOverrideEnabled(): Promise<boolean> {
  return invokeCommand<boolean>("is_config_override_enabled");
}

export async function loadPriorityConfig(): Promise<PriorityConfig> {
  return invokeCommand<PriorityConfig>("load_priority_config");
}

export async function savePriorityConfig(
  config: PriorityConfig,
): Promise<void> {
  return invokeCommand<void>("save_priority_config", { config });
}

export async function checkConfigFields(
  configPath: string,
): Promise<ConfigFieldsCheck> {
  return invokeCommand<ConfigFieldsCheck>("check_config_fields", {
    configPath,
  });
}

export async function openAppDirectory(): Promise<void> {
  return invokeCommand<void>("open_app_directory");
}

export async function getSingboxCoreStatus(): Promise<SingboxCoreStatus> {
  return invokeCommand<SingboxCoreStatus>("get_singbox_core_status");
}

export async function updateSingboxCore(): Promise<SingboxCoreUpdateResult> {
  return invokeCommand<SingboxCoreUpdateResult>("update_singbox_core");
}
