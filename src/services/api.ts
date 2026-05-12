import type {
  AppSettings,
  ClashOverview,
  ClashRulesSnapshot,
  ConfigFieldsCheck,
  ConfigOverride,
  PriorityConfig,
  SingboxCoreChannel,
  SingboxCoreStatus,
  SingboxCoreUpdateResult,
  SubscriptionInfo,
  SubscriptionRecord,
} from "../types/app";
import { normalizeAppSettings } from "../types/app";
import { invokeCommand } from "./tauri";

export function normalizeSubscriptions(
  parsed: Record<string, SubscriptionInfo | string>,
): SubscriptionRecord {
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      typeof value === "string" ? { url: value } : value,
    ]),
  );
}

export interface SubscriptionOperationResult {
  file_name: string;
  config_files: string[];
  subscriptions: string;
}

export async function addSubscription(
  url: string,
): Promise<SubscriptionOperationResult> {
  return invokeCommand<SubscriptionOperationResult>("add_subscription", { url });
}

export async function updateSubscription(
  fileName: string,
): Promise<SubscriptionOperationResult> {
  return invokeCommand<SubscriptionOperationResult>("update_subscription", {
    fileName,
  });
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
  if (!raw) return {};
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
  const settings = await invokeCommand<AppSettings>("load_app_settings");
  return normalizeAppSettings(settings);
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

export async function getClashOverview(): Promise<ClashOverview> {
  return invokeCommand<ClashOverview>("get_clash_overview");
}

export async function updateClashMode(mode: string): Promise<ClashOverview> {
  return invokeCommand<ClashOverview>("update_clash_mode", { mode });
}

export async function selectClashProxy(
  proxyGroup: string,
  name: string,
): Promise<ClashOverview> {
  return invokeCommand<ClashOverview>("select_clash_proxy", {
    proxyGroup,
    name,
  });
}

export async function testClashProxyDelay(
  proxyName: string,
  url?: string,
  timeoutMs?: number,
): Promise<number> {
  return invokeCommand<number>("test_clash_proxy_delay", {
    proxyName,
    url,
    timeoutMs,
  });
}

export async function testClashProxyGroupDelay(
  proxyGroup: string,
  url?: string,
  timeoutMs?: number,
): Promise<Record<string, number>> {
  return invokeCommand<Record<string, number>>("test_clash_proxy_group_delay", {
    proxyGroup,
    url,
    timeoutMs,
  });
}

export async function getClashRules(): Promise<ClashRulesSnapshot> {
  return invokeCommand<ClashRulesSnapshot>("get_clash_rules");
}

export async function flushFakeIpCache(): Promise<void> {
  return invokeCommand<void>("flush_fakeip_cache");
}

export async function flushDnsCache(): Promise<void> {
  return invokeCommand<void>("flush_dns_cache");
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

export async function generateRandomPort(): Promise<number> {
  return invokeCommand<number>("generate_random_port");
}

export async function generateRandomSecret(): Promise<string> {
  return invokeCommand<string>("generate_random_secret");
}

export async function openAppDirectory(): Promise<void> {
  return invokeCommand<void>("open_app_directory");
}

export async function getSingboxCoreStatus(
  forceRefresh = false,
): Promise<SingboxCoreStatus> {
  return invokeCommand<SingboxCoreStatus>("get_singbox_core_status", {
    forceRefresh,
  });
}

export async function activateSingboxCore(
  channel: SingboxCoreChannel,
  version: string,
): Promise<void> {
  return invokeCommand<void>("activate_singbox_core", { channel, version });
}

export async function updateSingboxCore(
  channel: SingboxCoreChannel,
  version: string,
): Promise<SingboxCoreUpdateResult> {
  return invokeCommand<SingboxCoreUpdateResult>("update_singbox_core", {
    channel,
    version,
  });
}

export async function cancelCoreUpdate(): Promise<void> {
  return invokeCommand<void>("cancel_core_update");
}

export async function queryDns(
  name: string,
  type: string = "A",
): Promise<unknown> {
  return invokeCommand<unknown>("query_dns", { name, type });
}

export async function closeAllConnections(): Promise<void> {
  return invokeCommand<void>("close_all_connections");
}

export async function closeConnection(id: string): Promise<void> {
  return invokeCommand<void>("close_connection", { id });
}

export interface FetchSubscriptionResult {
  content: string;
  file_name: string;
}

export async function fetchSubscription(
  url: string,
): Promise<FetchSubscriptionResult> {
  return invokeCommand<FetchSubscriptionResult>("fetch_subscription", { url });
}

export async function startTrafficStream(): Promise<void> {
  return invokeCommand<void>("start_traffic_stream");
}

export async function stopTrafficStream(): Promise<void> {
  return invokeCommand<void>("stop_traffic_stream");
}

export async function startMemoryStream(): Promise<void> {
  return invokeCommand<void>("start_memory_stream");
}

export async function stopMemoryStream(): Promise<void> {
  return invokeCommand<void>("stop_memory_stream");
}

export async function startConnectionsStream(): Promise<void> {
  return invokeCommand<void>("start_connections_stream");
}

export async function stopConnectionsStream(): Promise<void> {
  return invokeCommand<void>("stop_connections_stream");
}

export async function startLogsStream(): Promise<void> {
  return invokeCommand<void>("start_logs_stream");
}

export async function stopLogsStream(): Promise<void> {
  return invokeCommand<void>("stop_logs_stream");
}
