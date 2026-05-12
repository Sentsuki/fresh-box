pub mod commands;
mod icon;
mod model;
mod service;
mod state;

pub use commands::*;
pub use model::TrayCloseBehavior;
pub use service::apply_startup_preferences;
pub use service::close_main_window;
pub use service::enter_startup_background_mode;
pub use service::init_tray;
pub use service::refresh_runtime_state_from_backend;
pub use service::should_prevent_exit;
pub use service::show_main_window;
