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

pub use paths::{get_app_data_root, get_config_dir, get_data_dir, get_exe_dir, get_log_dir, get_sub_dir};

pub use priority::{
    DEFAULT_CLASH_CONTROLLER, DEFAULT_CLASH_SECRET, PriorityConfig, apply_priority_config,
    ensure_priority_config_initialized,
};
