// 设置的**形状**定义在这里；**存储**在 `store::settings`（SQLite 分区键值
// 表）。阶段 4 之前是 `app_settings.json` 加拆出来的 `backend_prefs.json`。
//
// `schema_version` 那套版本容错也一并去掉了：场景是全新安装，只有一个版本，
// 没有需要兼容的旧格式（见重构方案 01 节末的边界说明）。

use crate::errors::CommandError;
use crate::store::{Store, settings};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct AppSettings {
    pub app: AppConfig,
    pub proxies: ProxyPageSettings,
    pub connections: ConnectionPageSettings,
    pub logs: LogsPageSettings,
    pub profiles: ProfilesSettings,
    pub settings: AppDisplaySettings,
    pub updates: UpdateSettings,
    pub diagnostics: DiagnosticsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AppConfig {
    pub current_page: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ProfilesSettings {
    /// 选中的档案 id。
    ///
    /// 阶段 4 把内容文件改成按 UUID 命名之后，路径就不再是身份了 —— 但这个
    /// 结构当时漏改了，一直还留着 `selected_config_path`/`_display` 两个字段，
    /// 而实际的选中值被写在另一个设置键上。前端和后端因此指着两个不同的地方，
    /// 且没有任何编译错误提示。接 specta 生成类型时立刻暴露了出来。
    pub selected_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AppDisplaySettings {
    pub theme_mode: String,
    pub auto_close_connections: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct ProxyPageSettings {
    #[serde(default)]
    pub collapsed_groups: std::collections::BTreeMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
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
/// of it, unlike `auto_close_connections`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
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
/// （`host.ts` 的 `setOOMKillerEnabled`/`setOOMMemoryLimitMB`/
/// `setPowerReportEnabled`）。
///
/// 曾经还有一个 `oom_killer_kill_connections`：设置页能开、会持久化、类型里也
/// 有 —— 但 `StartOptions` proto 根本没这个字段，`build_start_options` 也从不
/// 读它。纯粹的死开关，用户打开什么都不会发生（审计项 M-11），阶段 5 删除。 Both are off by default, same as
/// the daemon's own `StartOptions::default()` fresh-box used to always send
/// — enabling either only takes effect the next time sing-box (re)starts,
/// same as fresh-box's other startup-only options (e.g. the TUN stack
/// setting).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct DiagnosticsSettings {
    pub oom_killer_enabled: bool,
    /// `u32` 而不是 `i64`：这是个「多少 MB」的上限，值域小得很，而 specta
    /// 会拒绝导出 64 位整数——它在 JS 里是 `number`，超过 2^53 会静默丢精度。
    /// 这个字段本来也不该有负数或天文数字。
    pub oom_memory_limit_mb: u32,
    pub power_report_enabled: bool,
}

impl Default for DiagnosticsSettings {
    fn default() -> Self {
        Self {
            oom_killer_enabled: false,
            oom_memory_limit_mb: 200,
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
        profiles: get_or_default(store, SCOPE_APP, settings::KEY_PROFILES)?,
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
    set(store, SCOPE_APP, settings::KEY_PROFILES, &value.profiles)?;
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

    /// Updates the in-memory cache — and *only* the cache, no I/O at all.
    ///
    /// Persistence isn't this type's job: `save_app_settings` already writes
    /// the `behavior` row as one of its eight sections, so a `set` that also
    /// wrote it just wrote the same row twice. Splitting the two apart is
    /// what lets `save_app_settings` be an `async` command whose entire
    /// database half runs on the blocking pool (审计项 H-3) while this half
    /// — a single `RwLock` write, microseconds, no disk — still happens
    /// synchronously and *first*, before the command awaits anything.
    ///
    /// That ordering is the point: as soon as the command returns (in fact,
    /// as soon as this line runs) `CloseRequested` and the tray's
    /// switch-node handler may read `get()`, and they must not see the old
    /// value. Doing it unconditionally also means a later disk-write failure
    /// can't leave this process making decisions on a value it already knows
    /// is stale — the caller still reports that failure.
    pub fn cache(&self, value: AppDisplaySettings) {
        if let Ok(mut guard) = self.0.write() {
            *guard = value;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> Store {
        Store::open_in_memory().expect("in-memory store")
    }

    #[test]
    fn a_fresh_database_reads_back_as_defaults() {
        let settings = load_app_settings(&store()).expect("load");
        let defaults = AppSettings::default();
        assert_eq!(settings.app.current_page, defaults.app.current_page);
        assert_eq!(settings.settings.theme_mode, "system");
        assert!(settings.settings.auto_close_connections);
        assert!(!settings.updates.check_update_enabled);
    }

    #[test]
    fn every_section_round_trips() {
        let store = store();
        let mut value = AppSettings::default();
        value.app.current_page = "logs".into();
        value.settings.theme_mode = "dark".into();
        value.settings.auto_close_connections = false;
        value.logs.type_filter = "error".into();
        value.profiles.selected_profile_id = Some("abc".into());
        value.connections.sort_key = "upload".into();
        value.connections.column_sizes.insert("host".into(), 120.0);
        value.updates.check_update_enabled = true;
        value.diagnostics.oom_memory_limit_mb = 4096;
        value.proxies.collapsed_groups.insert("g".into(), true);

        save_app_settings(&store, &value).expect("save");
        let read = load_app_settings(&store).expect("load");

        assert_eq!(read.app.current_page, "logs");
        assert_eq!(read.settings.theme_mode, "dark");
        assert!(!read.settings.auto_close_connections);
        assert_eq!(read.logs.type_filter, "error");
        assert_eq!(read.profiles.selected_profile_id.as_deref(), Some("abc"));
        assert_eq!(read.connections.sort_key, "upload");
        assert_eq!(read.connections.column_sizes.get("host"), Some(&120.0));
        assert!(read.updates.check_update_enabled);
        assert_eq!(read.diagnostics.oom_memory_limit_mb, 4096);
        assert_eq!(read.proxies.collapsed_groups.get("g"), Some(&true));
    }

    #[test]
    fn one_corrupt_section_does_not_reset_the_others() {
        // 这是 `backend_prefs.json` 当初拆出来要解决的问题，现在是 schema 的
        // 自然性质：一区一行，坏的那行自己回默认。
        let store = store();
        let mut value = AppSettings::default();
        value.app.current_page = "logs".into();
        value.settings.theme_mode = "dark".into();
        save_app_settings(&store, &value).expect("save");

        // 手动把连接页那一区写成解析不了的东西。
        store
            .with(|connection| {
                connection
                    .execute(
                        "UPDATE settings SET value = ?1 WHERE scope = ?2 AND key = ?3",
                        rusqlite::params!["{not json", settings::SCOPE_APP, "connections"],
                    )
                    .map_err(|e| CommandError::io("corrupt a section", e))?;
                Ok(())
            })
            .expect("corrupt");

        let read = load_app_settings(&store).expect("load still succeeds");
        assert_eq!(read.app.current_page, "logs", "neighbour section survives");
        assert_eq!(read.settings.theme_mode, "dark");
        assert_eq!(
            read.connections.sort_key,
            ConnectionPageSettings::default().sort_key,
            "the corrupt section falls back to its own defaults"
        );
    }

    #[test]
    fn diagnostics_can_be_read_without_parsing_everything_else() {
        let store = store();
        let mut value = AppSettings::default();
        value.diagnostics.oom_killer_enabled = true;
        value.diagnostics.oom_memory_limit_mb = 2048;
        save_app_settings(&store, &value).expect("save");

        let diagnostics = load_diagnostics(&store);
        assert!(diagnostics.oom_killer_enabled);
        assert_eq!(diagnostics.oom_memory_limit_mb, 2048);
    }

    #[test]
    fn backend_prefs_serve_from_memory_and_persist() {
        // 钉的是 `save_app_settings` 那条命令的两半合起来的效果：`cache` 只
        // 动内存（同步、无 I/O，所以它留在主线程上），落盘由
        // `save_app_settings` 自己写 behavior 那一行完成 —— 两者写的必须是
        // 同一个值、同一行，否则「关窗行为」这类后端判断会和设置页显示的
        // 对不上。
        let store = store();
        let prefs = BackendPrefsState::load(&store);
        assert!(prefs.get().auto_close_connections, "default");

        let value = AppSettings {
            settings: AppDisplaySettings {
                theme_mode: "dark".into(),
                auto_close_connections: false,
            },
            ..Default::default()
        };

        prefs.cache(value.settings.clone());
        // 内存缓存立刻可见，不等落盘。
        assert!(!prefs.get().auto_close_connections);

        save_app_settings(&store, &value).expect("save");
        // ……而且确实落到了同一行上，下次启动读得回来。
        assert!(!BackendPrefsState::load(&store).get().auto_close_connections);
        assert_eq!(
            load_app_settings(&store).expect("load").settings.theme_mode,
            "dark"
        );
    }
}
