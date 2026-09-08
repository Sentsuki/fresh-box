import type {
  AppSettings,
  ConfigFieldsCheck,
  ConfigOverride,
  PriorityConfig,
  ProfileEntry,
  ReportSummary,
  ReportFileView,
} from "../types/app";
import { normalizeAppSettings } from "../types/app";
import type { DaemonConnectionPhase } from "../types/daemon";
import { invokeCommand } from "./tauri";

/** Result of any command that adds/imports/refreshes a single profile —
 * `entry` is that profile, `profiles` is the full updated ordered list. */
export interface ProfileOperationResult {
  entry: ProfileEntry;
  profiles: ProfileEntry[];
}

export async function listProfiles(): Promise<ProfileEntry[]> {
  return invokeCommand<ProfileEntry[]>("list_profiles");
}

export async function addSubscription(
  url: string,
): Promise<ProfileOperationResult> {
  return invokeCommand<ProfileOperationResult>("add_subscription", { url });
}

export async function updateSubscription(
  id: string,
): Promise<ProfileOperationResult> {
  return invokeCommand<ProfileOperationResult>("update_subscription", { id });
}

/** Update a subscription's URL without re-fetching it. */
export async function editSubscriptionUrl(
  id: string,
  url: string,
): Promise<ProfileEntry[]> {
  return invokeCommand<ProfileEntry[]>("edit_subscription_url", { id, url });
}

/** Enable/disable background auto-update for a subscription, and set its
 * check interval (`undefined` = use the backend's default). */
export async function setSubscriptionAutoUpdate(
  id: string,
  enabled: boolean,
  intervalMinutes?: number,
): Promise<ProfileEntry[]> {
  return invokeCommand<ProfileEntry[]>("set_subscription_auto_update", {
    id,
    enabled,
    intervalMinutes,
  });
}

export async function importProfileFile(
  sourcePath: string,
): Promise<ProfileOperationResult> {
  return invokeCommand<ProfileOperationResult>("import_profile_file", {
    sourcePath,
  });
}

export async function renameProfile(
  id: string,
  newName: string,
): Promise<ProfileEntry[]> {
  return invokeCommand<ProfileEntry[]>("rename_profile", { id, newName });
}

export async function deleteProfile(id: string): Promise<ProfileEntry[]> {
  return invokeCommand<ProfileEntry[]>("delete_profile", { id });
}

export async function openConfigFile(id: string): Promise<void> {
  return invokeCommand<void>("open_config_file", { id });
}

export async function loadAppSettings(): Promise<AppSettings> {
  const settings = await invokeCommand<AppSettings>("load_app_settings");
  return normalizeAppSettings(settings);
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return invokeCommand<void>("save_app_settings", { settings });
}

export async function startSingbox(profileId: string): Promise<void> {
  return invokeCommand<void>("start_singbox", { profileId });
}

export async function stopSingbox(): Promise<void> {
  return invokeCommand<void>("stop_singbox");
}

/**
 * Current daemon connection phase, for a component's first render — see
 * `useDaemonConnectionListener` for how it's kept fresh afterward via the
 * `daemon-state-changed` event. This (plus that event) is the only way the
 * frontend learns whether sing-box is running; there's no separate
 * point-in-time "is it running" check any more.
 */
export async function getDaemonState(): Promise<DaemonConnectionPhase> {
  return invokeCommand<DaemonConnectionPhase>("get_daemon_state");
}

/** Wake the daemon reconciliation loop to retry immediately instead of
 * waiting out its current backoff. */
export async function retryDaemonConnection(): Promise<void> {
  return invokeCommand<void>("retry_daemon_connection");
}

/** 从另一个 Windows 用户会话接管 daemon —— `owned-by-other-user` 的出口。 */
export async function takeOverDaemon(): Promise<void> {
  return invokeCommand<void>("take_over_daemon");
}

export async function isDaemonServiceInstalled(): Promise<boolean> {
  return invokeCommand<boolean>("is_daemon_service_installed");
}

/** Registers the sing-box-daemon Windows service. Triggers a UAC prompt. */
export async function installDaemonService(): Promise<void> {
  return invokeCommand<void>("install_daemon_service");
}

/**
 * Lighter repair action for when the service is installed but unreachable
 * (stopped, crashed and didn't come back, ...): restarts it in place
 * instead of a full uninstall/reinstall. Triggers a UAC prompt.
 */
export async function repairDaemonService(): Promise<void> {
  return invokeCommand<void>("repair_daemon_service");
}

/** Unregisters the sing-box-daemon Windows service. Triggers a UAC prompt. */
export async function uninstallDaemonService(): Promise<void> {
  return invokeCommand<void>("uninstall_daemon_service");
}

/** `true` if fresh-box is registered to launch at Windows startup. */
export async function isAutostartEnabled(): Promise<boolean> {
  return invokeCommand<boolean>("is_autostart_enabled");
}

/** Registers fresh-box to launch (minimized to tray) at Windows startup. */
export async function enableAutostart(): Promise<void> {
  return invokeCommand<void>("enable_autostart");
}

export async function disableAutostart(): Promise<void> {
  return invokeCommand<void>("disable_autostart");
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
  profileId: string,
): Promise<ConfigFieldsCheck> {
  return invokeCommand<ConfigFieldsCheck>("check_config_fields", {
    profileId,
  });
}

export async function openAppDirectory(): Promise<void> {
  return invokeCommand<void>("open_app_directory");
}

/**
 * Record a renderer-side error caught by `ErrorBoundary` so it's not just
 * lost to `console.error` the moment the user closes the app — it lands
 * next to native-panic crash reports (see `logger.rs`/`crash_reports.rs`)
 * instead. Best-effort: callers shouldn't let a failure here mask the
 * original error.
 */
export async function recordFrontendError(
  name: string,
  message: string,
  stack?: string,
): Promise<void> {
  return invokeCommand<void>("record_frontend_error", { name, message, stack });
}

// ── Advanced page: diagnostics tools ────────────────────────────────────

// ── Advanced page: crash/OOM/power reports ──────────────────────────────

export async function listCrashReports(): Promise<ReportSummary[]> {
  return invokeCommand<ReportSummary[]>("list_crash_reports_all");
}

export async function readCrashReport(id: string): Promise<ReportFileView[]> {
  return invokeCommand<ReportFileView[]>("read_crash_report", { id });
}

export async function deleteCrashReport(id: string): Promise<void> {
  return invokeCommand<void>("delete_crash_report", { id });
}

export async function deleteAllCrashReports(): Promise<void> {
  return invokeCommand<void>("delete_all_crash_reports");
}

export async function listOomReports(): Promise<ReportSummary[]> {
  return invokeCommand<ReportSummary[]>("list_oom_reports");
}

export async function readOomReport(name: string): Promise<ReportFileView[]> {
  return invokeCommand<ReportFileView[]>("read_oom_report", { name });
}

export async function deleteOomReport(name: string): Promise<void> {
  return invokeCommand<void>("delete_oom_report", { name });
}

export async function deleteAllOomReports(): Promise<void> {
  return invokeCommand<void>("delete_all_oom_reports");
}

export async function listPowerReports(): Promise<ReportSummary[]> {
  return invokeCommand<ReportSummary[]>("list_power_reports");
}

export async function readPowerReport(name: string): Promise<ReportFileView[]> {
  return invokeCommand<ReportFileView[]>("read_power_report", { name });
}

export async function deletePowerReport(name: string): Promise<void> {
  return invokeCommand<void>("delete_power_report", { name });
}

export async function deleteAllPowerReports(): Promise<void> {
  return invokeCommand<void>("delete_all_power_reports");
}
