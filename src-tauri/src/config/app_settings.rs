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
