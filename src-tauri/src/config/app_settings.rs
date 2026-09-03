use crate::errors::CommandError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const APP_SETTINGS_FILE: &str = "app_settings.json";
const APP_SETTINGS_SCHEMA_VERSION: u32 = 1;

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

/// The subset of `AppSettings.settings` the *backend* needs to make
/// control-flow decisions with — window-close behavior
/// (`main.rs`'s `CloseRequested` handler) and whether to auto-close
/// connections on a proxy switch (`services::daemon_control`, `tray.rs`) —
/// as opposed to the rest of `AppSettings`, which only the frontend ever
/// reads. Kept as an in-memory cache (managed Tauri state), refreshed
/// synchronously whenever `save_app_settings` runs, instead of the backend
/// re-reading and re-parsing the *entire* `app_settings.json` blob every
/// time it needs to know e.g. whether to hide-or-destroy the window on
/// close. Two concrete problems that fixes:
///   - A parse failure somewhere unrelated in that blob (a stray value in
///     `connections.column_sizes`, say) used to fall back to
///     `AppSettings::default()` in full — silently resetting
///     `close_behavior`/`auto_close_connections` along with everything
///     else. This cache can only ever hold the last value that actually
///     round-tripped through `save_app_settings`'s typed `AppSettings`
///     parameter, so an unrelated field's corruption can't touch it.
///   - The frontend writes settings and the backend reads them at two
///     different times; re-parsing disk on every read left a window where
///     a `CloseRequested` handled right after the frontend fired off (but
///     before the write actually landed) a settings change could still
///     observe the *old* value. Updating this cache happens synchronously
///     inside the same `save_app_settings` call the frontend awaits,
///     closing most of that window (the part that remains — the frontend
///     not awaiting the write at all before letting the user close — is a
///     frontend-side concern, not one this cache can fix on its own).
pub struct BackendPrefsState(std::sync::RwLock<AppDisplaySettings>);

impl BackendPrefsState {
    /// Read once at startup — a normal disk load, same fallback-to-default
    /// behavior as everywhere else. From here on, every read goes through
    /// `get()` instead.
    pub fn load() -> Self {
        let settings = load_app_settings_file()
            .map(|s| s.settings)
            .unwrap_or_default();
        Self(std::sync::RwLock::new(settings))
    }

    pub fn get(&self) -> AppDisplaySettings {
        self.0
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn set(&self, settings: AppDisplaySettings) {
        if let Ok(mut guard) = self.0.write() {
            *guard = settings;
        }
    }
}
