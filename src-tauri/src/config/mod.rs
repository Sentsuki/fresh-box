pub mod app_settings;
pub mod config_override;
pub mod io;
pub mod paths;
pub mod priority;

// 常用项重导出，调用处写 `crate::config::Foo` 即可
pub use app_settings::AppSettings;
pub use config_override::{apply_config_override, get_override_config_if_enabled};
pub use paths::{get_app_data_root, get_exe_dir};
pub use priority::apply_priority_config;
