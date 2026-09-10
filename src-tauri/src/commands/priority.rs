// `async fn` + `run_blocking`，理由见 `commands::config_override` 顶部的注释
// 与 `store::Store::run_blocking`（审计项 H-3）。`check_config_fields` 还要读
// 一整份配置内容文件，更不该发生在主线程上。

use crate::config::priority::{ConfigFieldsCheck, PriorityConfig};
use crate::errors::CommandError;
use crate::store::Store;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn save_priority_config(
    store: State<'_, Store>,
    config: PriorityConfig,
) -> Result<(), CommandError> {
    store
        .run_blocking(move |store| {
            crate::config::priority::save_priority_config_inner(store, config)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn load_priority_config(store: State<'_, Store>) -> Result<PriorityConfig, CommandError> {
    store
        .run_blocking(crate::config::priority::load_priority_config_inner)
        .await
}

/// 检查某个档案的配置里是否已经带了 `inbounds[].stack` / `log` 字段 —— 设置页
/// 据此提示「你的配置里本来就写了这个，会被覆盖」。
///
/// 按 **profile id** 取内容，不再收路径：内容文件按 UUID 命名，路径对前端没有
/// 意义（阶段 4 起）。
#[tauri::command]
#[specta::specta]
pub async fn check_config_fields(
    store: State<'_, Store>,
    profile_id: String,
) -> Result<ConfigFieldsCheck, CommandError> {
    store
        .run_blocking(move |store| {
            crate::config::priority::check_config_fields_inner(store, &profile_id)
        })
        .await
}
