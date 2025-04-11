// lib.rs - 可选的库文件，用于导出所有公共模块和函数

pub mod config;
pub mod config_override;
pub mod errors;
pub mod singbox;
pub mod tray;

// 重新导出常用类型，让它们更容易访问
pub use errors::CommandError;
pub use singbox::SingboxState;