use tauri::State;
use crate::store::Store;
use crate::errors::CommandError;

#[tauri::command]
#[specta::specta]
pub fn enable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::enable_config_override_inner(store.inner())
}

#[tauri::command]
#[specta::specta]
pub fn disable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::disable_config_override_inner(store.inner())
}

#[tauri::command]
#[specta::specta]
/// 覆盖层以 **JSON 文本**过界，不是 `serde_json::Value`。
///
/// 两个理由：前端本来就把它当文本编辑（`rawJson` 就是编辑器里那个字符串），
/// 只在 IPC 边界上 stringify/parse 一次；而 `Value` 是自引用类型
/// （`Value::Array(Vec<Value>)`），specta rc.25 导出时会无限递归 —— 16 MB 栈
/// 都不够，直接爆栈。
///
/// 顺带把「这是不是合法 JSON」的判断挪到了这里，报错信息比前端 `JSON.parse`
/// 抛出来的更贴合上下文。
pub fn save_config_override(store: State<'_, Store>, config: String) -> Result<(), CommandError> {
    let parsed: serde_json::Value = if config.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&config)
            .map_err(|e| CommandError::validation(format!("Config override is not valid JSON: {e}")))?
    };
    crate::config::config_override::save_config_override_inner(store.inner(), parsed)
}

#[tauri::command]
#[specta::specta]
pub fn clear_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::clear_config_override_inner(store.inner())
}

#[tauri::command]
#[specta::specta]
/// 返回覆盖层的 JSON 文本（见 `save_config_override` 里为什么是文本）。
pub fn load_config_override(store: State<'_, Store>) -> Result<String, CommandError> {
    let value = crate::config::config_override::load_config_override_inner(store.inner())?;
    serde_json::to_string_pretty(&value).map_err(|e| CommandError::json("serialize config override", e))
}

#[tauri::command]
#[specta::specta]
pub fn is_config_override_enabled(store: State<'_, Store>) -> Result<bool, CommandError> {
    crate::config::config_override::is_config_override_enabled_inner(store.inner())
}
