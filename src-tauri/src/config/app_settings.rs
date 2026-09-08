// 设置的**形状**定义在这里；**存储**在 `store::settings`（SQLite 分区键值
// 表）。阶段 4 之前是 `app_settings.json` 加拆出来的 `backend_prefs.json`。
//
// `schema_version` 那套版本容错也一并去掉了：场景是全新安装，只有一个版本，
// 没有需要兼容的旧格式（见重构方案 01 节末的边界说明）。

use crate::errors::CommandError;
use crate::store::{Store, settings};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub app: AppConfig,
    #[serde(default)]
    pub proxies: ProxyPageSettings,
    #[serde(default)]
    pub connections: ConnectionPageSettings,
    #[serde(default)]
    pub logs: LogsPageSettings,
    #[serde(default)]
    pub profiles: ProfilesSettings,
    #[serde(default)]
    pub settings: AppDisplaySettings,
    #[serde(default)]
    pub updates: UpdateSettings,
    #[serde(default)]
    pub diagnostics: DiagnosticsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub current_page: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProfilesSettings {
    pub selected_config_path: Option<String>,
    pub selected_config_display: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppDisplaySettings {
    pub theme_mode: String,
    pub close_behavior: String,
    pub auto_close_connections: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProxyPageSettings {
    #[serde(default)]
    pub collapsed_groups: std::collections::BTreeMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ConnectionPageSettings {
    pub current_tab: String,
    pub visible_columns: Vec<String>,
    pub pinned_columns: Vec<String>,
    pub sort_key: String,
    pub sort_direction: String,
    pub grouped_column: Option<String>,
    #[serde(default)]
    pub column_sizes: std::collections::BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LogsPageSettings {
    pub type_filter: String,
}

/// Pure frontend bookkeeping for the update-check flow
/// (`tauri-plugin-updater` does the actual checking/downloading/installing
/// — this is only ever read/written by the frontend, deciding *when* to
/// call it and *whether to bother the user again* about a version already
/// shown). Mirrors the official desktop client's own preferences
/// (`check_update_enabled`, `update_check_prompted`,
/// `last_shown_update_version` in `updates.ts`). None of this belongs in
/// `AppDisplaySettings`/`BackendPrefsState` — the backend never reads any
/// of it, unlike `close_behavior`/`auto_close_connections`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateSettings {
    /// Opt-in, like the official client — defaults to `false` so a fresh
    /// install never phones home to GitHub until the user has explicitly
    /// agreed to it.
    pub check_update_enabled: bool,
    /// Whether the user has already been asked once whether to enable
    /// automatic checks — so that one-time prompt only ever shows once,
    /// regardless of which way they answered.
    pub update_check_prompted: bool,
    /// The version of the last update the user was actually shown a
    /// notification for — so the same available update doesn't re-prompt
    /// on every single launch until they either install it or a newer one
    /// comes out.
    pub last_shown_update_version: String,
}

/// Passed to the daemon's `StartOptions` on every `StartService` call (see
/// `services::singbox::start_singbox`) — mirrors the official desktop
/// client's own OOM-killer/power-report settings
/// (`setOOMKillerEnabled`/`setOOMMemoryLimitMB`/`setOOMKillerKillConnections`/
/// `setPowerReportEnabled` in `host.ts`). Both are off by default, same as
/// the daemon's own `StartOptions::default()` fresh-box used to always send
/// — enabling either only takes effect the next time sing-box (re)starts,
/// same as fresh-box's other startup-only options (e.g. the TUN stack
/// setting).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DiagnosticsSettings {
    pub oom_killer_enabled: bool,
    pub oom_memory_limit_mb: i64,
    pub oom_killer_kill_connections: bool,
    pub power_report_enabled: bool,
}

impl Default for DiagnosticsSettings {
    fn default() -> Self {
        Self {
            oom_killer_enabled: false,
            oom_memory_limit_mb: 200,
            oom_killer_kill_connections: false,
            power_report_enabled: false,
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            current_page: "overview".to_string(),
        }
    }
}

impl Default for AppDisplaySettings {
    fn default() -> Self {
        Self {
            theme_mode: "system".to_string(),
            close_behavior: "hide".to_string(),
            auto_close_connections: true,
        }
    }
}

impl Default for ConnectionPageSettings {
    fn default() -> Self {
        Self {
            current_tab: "active".to_string(),
            visible_columns: vec![
                "process".to_string(),
                "downloadSpeed".to_string(),
                "uploadSpeed".to_string(),
                "chain".to_string(),
                "destination".to_string(),
            ],
            pinned_columns: vec![],
            sort_key: "downloadSpeed".to_string(),
            sort_direction: "desc".to_string(),
            grouped_column: None,
            column_sizes: std::collections::BTreeMap::new(),
        }
    }
}

/// 各区在 `settings` 表里的 key。一区一行 —— 一区坏掉碰不到别的区。
const KEY_APP: &str = "app";
const KEY_PROXIES: &str = "proxies";
const KEY_CONNECTIONS: &str = "connections";
const KEY_LOGS: &str = "logs";
const KEY_PROFILES: &str = "profiles";
const KEY_UPDATES: &str = "updates";
const KEY_DIAGNOSTICS: &str = "diagnostics";

/// 读回前端要的整份设置。逐区读取，任何一区解析失败只影响它自己
/// （`settings::get_or_default` 会退回该区的默认值）。
pub fn load_app_settings(store: &Store) -> Result<AppSettings, CommandError> {
    use settings::{SCOPE_APP, get_or_default};
    Ok(AppSettings {
        app: get_or_default(store, SCOPE_APP, KEY_APP)?,
        proxies: get_or_default(store, SCOPE_APP, KEY_PROXIES)?,
        connections: get_or_default(store, SCOPE_APP, KEY_CONNECTIONS)?,
        logs: get_or_default(store, SCOPE_APP, KEY_LOGS)?,
        profiles: get_or_default(store, SCOPE_APP, KEY_PROFILES)?,
        settings: get_or_default(store, SCOPE_APP, settings::KEY_BEHAVIOR)?,
        updates: get_or_default(store, SCOPE_APP, KEY_UPDATES)?,
        diagnostics: get_or_default(store, SCOPE_APP, KEY_DIAGNOSTICS)?,
    })
}

pub fn save_app_settings(store: &Store, value: &AppSettings) -> Result<(), CommandError> {
    use settings::{SCOPE_APP, set};
    set(store, SCOPE_APP, KEY_APP, &value.app)?;
    set(store, SCOPE_APP, KEY_PROXIES, &value.proxies)?;
    set(store, SCOPE_APP, KEY_CONNECTIONS, &value.connections)?;
    set(store, SCOPE_APP, KEY_LOGS, &value.logs)?;
    set(store, SCOPE_APP, KEY_PROFILES, &value.profiles)?;
    set(store, SCOPE_APP, settings::KEY_BEHAVIOR, &value.settings)?;
    set(store, SCOPE_APP, KEY_UPDATES, &value.updates)?;
    set(store, SCOPE_APP, KEY_DIAGNOSTICS, &value.diagnostics)
}

/// 后端自己要用的那一区（诊断选项），单独读，不必解析整份设置。
pub fn load_diagnostics(store: &Store) -> DiagnosticsSettings {
    settings::get_or_default(store, settings::SCOPE_APP, KEY_DIAGNOSTICS).unwrap_or_default()
}

/// 后端做控制流判断要用的那一小撮设置：窗口关闭行为（`main.rs` 的
/// `CloseRequested`）和切换节点后是否自动断开连接（`tray.rs`）。其余的
/// `AppSettings`（当前页面、表格列宽、折叠状态……）只有前端读。
///
/// 独立缓存一份在内存里，是为了让这些判断路径不必每次都去查库。持久化则和
/// 其他区一样走 `settings` 表的 `behavior` 行 —— 阶段 4 之前它需要一个单独的
/// `backend_prefs.json`，因为整块 JSON 里任何一处解析失败都会把它一起打回
/// 默认值；一区一行之后这个隔离是 schema 自带的，不用再靠拆文件实现。
pub struct BackendPrefsState(std::sync::RwLock<AppDisplaySettings>);

impl BackendPrefsState {
    /// 启动时读一次；之后每次读都走 `get()` 的内存缓存。
    pub fn load(store: &Store) -> Self {
        let value = settings::get_or_default(store, settings::SCOPE_APP, settings::KEY_BEHAVIOR)
            .unwrap_or_default();
        Self(std::sync::RwLock::new(value))
    }

    pub fn get(&self) -> AppDisplaySettings {
        self.0.read().map(|guard| guard.clone()).unwrap_or_default()
    }

    /// Updates the in-memory cache immediately (so every in-process reader
    /// — even one racing this call — sees the new value as soon as this
    /// returns) and persists it to `BACKEND_PREFS_FILE`. The in-memory
    /// update happens first and unconditionally: a transient disk-write
    /// failure shouldn't leave this process's own decisions running on a
    /// stale value it already knows is wrong, even though it's right to
    /// still report that failure to the caller (`save_app_settings`, which
    /// folds it into the same error it'd return for the main settings file
    /// failing to save).
    pub fn set(&self, store: &Store, value: AppDisplaySettings) -> Result<(), CommandError> {
        if let Ok(mut guard) = self.0.write() {
            *guard = value.clone();
        }
        settings::set(store, settings::SCOPE_APP, settings::KEY_BEHAVIOR, &value)
    }
}
