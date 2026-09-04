pub mod app_settings;
pub mod config_override;
pub mod io;
pub mod paths;
pub mod priority;
pub mod profiles;

// Re-export commonly used items so callsites can use `crate::config::Foo`
pub use app_settings::AppSettings;

pub use config_override::{apply_config_override, get_override_config_if_enabled};

pub use io::load_named_config_or_default;

pub use paths::{get_app_data_root, get_exe_dir};

pub use priority::{PriorityConfig, apply_priority_config, ensure_priority_config_initialized};
