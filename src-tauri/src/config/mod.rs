pub mod app_settings;
pub mod config_override;
pub mod io;
pub mod paths;
pub mod priority;
pub mod profiles;

// Re-export commonly used items so callsites can use `crate::config::Foo`
pub use app_settings::{AppSettings, load_app_settings_file};

pub use config_override::{apply_config_override, get_override_config_if_enabled};

pub use io::{load_named_config_or_default, read_json_file, write_json_file};

pub use paths::{
    CORE_CHANNEL_STABLE, CORE_CHANNEL_TESTING, get_active_singbox_core_executable,
    get_active_singbox_core_selection, get_bin_dir, get_core_channel_dir, get_core_version_dir,
    get_data_dir, normalize_core_channel, set_active_singbox_core_selection,
};

pub use priority::{
    DEFAULT_CLASH_CONTROLLER, DEFAULT_CLASH_SECRET, PriorityConfig, apply_priority_config,
    ensure_priority_config_initialized,
};
