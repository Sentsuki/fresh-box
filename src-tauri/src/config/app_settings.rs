use crate::errors::CommandError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const APP_SETTINGS_FILE: &str = "app_settings.json";
const APP_SETTINGS_SCHEMA_VERSION: u32 = 1;

/// Where `BackendPrefsState` persists — physically separate from
/// `APP_SETTINGS_FILE`, not just cached in memory over it. See
/// `BackendPrefsState`'s doc comment for why: the backend's own
/// close-behavior/auto-close-connections decisions no longer depend, even
/// at process startup, on successfully parsing the rest of the (much
/// larger, frontend-owned) settings blob at all.
const BACKEND_PREFS_FILE: &str = "backend_prefs.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_app_settings_schema_version")]
    pub schema_version: u32,
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

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: APP_SETTINGS_SCHEMA_VERSION,
            app: AppConfig::default(),
            proxies: ProxyPageSettings::default(),
            connections: ConnectionPageSettings::default(),
            logs: LogsPageSettings::default(),
            profiles: ProfilesSettings::default(),
            settings: AppDisplaySettings::default(),
            updates: UpdateSettings::default(),
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

fn normalize_app_settings(value: Value) -> Result<AppSettings, CommandError> {
    let mut settings = serde_json::from_value::<AppSettings>(value).unwrap_or_default();
    settings.schema_version = APP_SETTINGS_SCHEMA_VERSION;
    Ok(settings)
}

fn default_app_settings_schema_version() -> u32 {
    APP_SETTINGS_SCHEMA_VERSION
}

fn get_app_settings_path() -> Result<std::path::PathBuf, CommandError> {
    Ok(super::paths::get_config_dir()?.join(APP_SETTINGS_FILE))
}

pub fn load_app_settings_file() -> Result<AppSettings, CommandError> {
    let path = get_app_settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let value: Value = super::io::read_json_file(&path)?;
    normalize_app_settings(value)
}

pub fn save_app_settings_file(settings: &AppSettings) -> Result<(), CommandError> {
    super::io::write_json_file(&get_app_settings_path()?, settings)
}

fn get_backend_prefs_path() -> Result<std::path::PathBuf, CommandError> {
    Ok(super::paths::get_config_dir()?.join(BACKEND_PREFS_FILE))
}

fn load_backend_prefs_file() -> Result<AppDisplaySettings, CommandError> {
    let path = get_backend_prefs_path()?;
    if !path.exists() {
        return Ok(AppDisplaySettings::default());
    }
    super::io::read_json_file(&path)
}

fn save_backend_prefs_file(settings: &AppDisplaySettings) -> Result<(), CommandError> {
    super::io::write_json_file(&get_backend_prefs_path()?, settings)
}

/// The subset of app settings the *backend* needs to make control-flow
/// decisions with — window-close behavior (`main.rs`'s `CloseRequested`
/// handler) and whether to auto-close connections on a proxy switch
/// (`services::daemon_control`, `tray.rs`) — as opposed to the rest of
/// `AppSettings` (current page, table column layout, collapsed groups, ...),
/// which only the frontend ever reads. Backed by its own file
/// (`BACKEND_PREFS_FILE`), physically separate from the much larger
/// `APP_SETTINGS_FILE` the frontend round-trips wholesale, plus an
/// in-memory cache (managed Tauri state) of the same content for the
/// backend's own reads — so nothing on the backend's decision path ever
/// has to parse the frontend's blob at all. `save_app_settings` keeps a
/// mirror copy inside `APP_SETTINGS_FILE` too (so `load_app_settings`
/// still round-trips the *whole* settings shape in one call for the
/// frontend, unchanged), but that copy is never read back by anything on
/// the backend — `BACKEND_PREFS_FILE`/this cache are.
///
/// Splitting this out physically, not just caching it in memory over one
/// shared file, closes the gap the in-memory-only version still had: a
/// parse failure elsewhere in `APP_SETTINGS_FILE` (a stray value in
/// `connections.column_sizes`, say) could still reset
/// `close_behavior`/`auto_close_connections` to defaults the moment the
/// process restarted and reloaded that cache from the same corrupted blob.
/// With its own file, a problem anywhere in `APP_SETTINGS_FILE` can no
/// longer touch this at all, at startup or otherwise.
pub struct BackendPrefsState(std::sync::RwLock<AppDisplaySettings>);

impl BackendPrefsState {
    /// Read once at startup — a normal disk load, same fallback-to-default
    /// behavior as everywhere else. From here on, every read goes through
    /// `get()` instead.
    pub fn load() -> Self {
        let settings = load_backend_prefs_file().unwrap_or_default();
        Self(std::sync::RwLock::new(settings))
    }

    pub fn get(&self) -> AppDisplaySettings {
        self.0
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
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
    pub fn set(&self, settings: AppDisplaySettings) -> Result<(), CommandError> {
        if let Ok(mut guard) = self.0.write() {
            *guard = settings.clone();
        }
        save_backend_prefs_file(&settings)
    }
}
