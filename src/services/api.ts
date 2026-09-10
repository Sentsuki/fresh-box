// host 域命令的前端入口。
//
// 阶段 5 之前这里是 ~50 个手写的 `invokeCommand<T>("命令名", {...})` 包装：
// 命令名、参数名、返回类型全靠人肉和 Rust 保持一致，`check-commands.mjs` 只
// 能兜住前两样。现在整份从 Rust 生成（`src/gen/host.ts`，见
// `src-tauri/src/ipc.rs`），这个文件只剩「把生成的名字原样导出」。
//
// 保留这一层而不是让各处直接 import 生成物，是为了：
//   * 生成物路径/形状变了只改这一个文件
//   * `listCrashReports` 这类和 Rust 函数名不同的习惯叫法有地方安放
//
// daemon 域不走这里 —— 它由 protobuf 生成的 stub 直接调用（`src/daemon/`）。

import { commands } from "../gen/host";
import { normalizeAppSettings, type AppSettings } from "../types/app";

export const {
  addSubscription,
  checkConfigFields,
  clearConfigOverride,
  deleteAllCrashReports,
  deleteAllOomReports,
  deleteAllPowerReports,
  deleteCrashReport,
  deleteOomReport,
  deletePowerReport,
  deleteProfile,
  destroyWorkingDirectory,
  disableAutostart,
  disableConfigOverride,
  editSubscriptionUrl,
  enableAutostart,
  enableConfigOverride,
  exportCrashReport,
  exportProfile,
  exportOomReport,
  exportPowerReport,
  getCoreInfo,
  getDaemonState,
  getWorkingDirectory,
  importProfileData,
  importProfileFile,
  installDaemonService,
  isAutostartEnabled,
  isConfigOverrideEnabled,
  isDaemonServiceInstalled,
  listOomReports,
  listPowerReports,
  listProfiles,
  loadConfigOverride,
  loadPriorityConfig,
  openAppDirectory,
  openConfigFile,
  readCrashReport,
  readOomReport,
  readPowerReport,
  recordFrontendError,
  renameProfile,
  repairDaemonService,
  retryDaemonConnection,
  saveAppSettings,
  saveConfigOverride,
  savePriorityConfig,
  setSubscriptionAutoUpdate,
  startSingbox,
  stopSingbox,
  takeOverDaemon,
  uninstallDaemonService,
  updateMicaTheme,
  updateSubscription,
} = commands;

/** Rust 侧叫 `list_crash_reports_all`（要和只列 daemon 那份的区分开），前端
 * 一直用这个更短的名字。 */
export const listCrashReports = commands.listCrashReportsAll;

/**
 * 读设置，并在 IPC 边界上归一化一次。
 *
 * 生成的类型里各区字段都是可选的（Rust 每区都带 `#[serde(default)]`，那是
 * 反序列化的健壮性）。补齐放在这一个地方，页面就不用到处 `?.` 和 `??`
 * —— 见 `types/app.ts` 里 `AppSettings` 的说明。
 */
export async function loadAppSettings(): Promise<AppSettings> {
  return normalizeAppSettings(await commands.loadAppSettings());
}
