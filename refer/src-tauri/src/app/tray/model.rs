use serde::{Deserialize, Serialize};

pub const TRAY_ICON_ID: &str = "main_tray";

pub mod menu_ids {
    pub const SHOW_WINDOW: &str = "tray_show_window";
    pub const KERNEL_SUBMENU: &str = "tray_kernel_submenu";
    pub const KERNEL_STATUS: &str = "tray_kernel_status";
    pub const KERNEL_RESTART: &str = "tray_kernel_restart";
    pub const PROXY_SUBMENU: &str = "tray_proxy_submenu";
    pub const PROXY_CURRENT: &str = "tray_proxy_current";
    pub const PROXY_SYSTEM: &str = "tray_proxy_system";
    pub const PROXY_TUN: &str = "tray_proxy_tun";
    pub const QUIT: &str = "tray_quit";
}

pub mod events {
    pub const ACTION_SHOW_WINDOW: &str = "tray-action-show-window";
    pub const ACTION_HIDE_WINDOW: &str = "tray-action-hide-window";
    pub const ACTION_NAVIGATE_LAST_ROUTE: &str = "tray-action-navigate-last-route";
    pub const ACTION_EXIT_REQUESTED: &str = "tray-action-exit-requested";
    pub const ACTION_SWITCH_PROXY_MODE: &str = "tray-action-switch-proxy-mode";
    pub const RUNTIME_STATE_UPDATED: &str = "tray-runtime-state-updated";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrayProxyMode {
    System,
    Tun,
    #[default]
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrayCloseBehavior {
    #[default]
    Hide,
    Lightweight,
}

impl TrayCloseBehavior {
    pub fn from_raw(value: &str) -> Self {
        match value.trim() {
            "lightweight" => Self::Lightweight,
            _ => Self::Hide,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TrayRuntimeStateInput {
    pub kernel_running: bool,
    pub system_proxy_enabled: bool,
    pub tun_enabled: bool,
    pub active_subscription_name: Option<String>,
    pub locale: String,
    pub window_visible: bool,
    pub close_behavior: TrayCloseBehavior,
}

impl Default for TrayRuntimeStateInput {
    fn default() -> Self {
        Self {
            kernel_running: false,
            system_proxy_enabled: false,
            tun_enabled: false,
            active_subscription_name: None,
            locale: "en-US".to_string(),
            window_visible: true,
            close_behavior: TrayCloseBehavior::Hide,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayNavigatePayload {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayToggleProxyFeaturePayload {
    pub feature: String,
    pub enabled: bool,
}
