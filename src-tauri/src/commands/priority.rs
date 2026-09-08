use crate::config::priority::{ConfigFieldsCheck, PriorityConfig};
use crate::errors::CommandError;
use crate::store::Store;
use tauri::State;

#[tauri::command]
pub fn save_priority_config(
    store: State<'_, Store>,
    config: PriorityConfig,
) -> Result<(), CommandError> {
    crate::config::priority::save_priority_config_inner(store.inner(), config)
}

#[tauri::command]
pub fn load_priority_config(store: State<'_, Store>) -> Result<PriorityConfig, CommandError> {
    crate::config::priority::load_priority_config_inner(store.inner())
}

/// 检查某个档案的配置里是否已经带了 `inbounds[].stack` / `log` 字段 —— 设置页
/// 据此提示「你的配置里本来就写了这个，会被覆盖」。
///
/// 按 **profile id** 取内容，不再收路径：内容文件按 UUID 命名，路径对前端没有
/// 意义（阶段 4 起）。
#[tauri::command]
pub fn check_config_fields(
    store: State<'_, Store>,
    profile_id: String,
) -> Result<ConfigFieldsCheck, CommandError> {
    crate::config::priority::check_config_fields_inner(store.inner(), &profile_id)
}
