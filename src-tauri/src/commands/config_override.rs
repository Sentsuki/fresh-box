// 这些命令全部是 `async fn` + `Store::run_blocking`，即使函数体本身只是一次
// 很短的库操作。理由见 `store::Store::run_blocking` 的文档注释：同步的
// `#[tauri::command] fn` 在 IPC 消息所在线程就地执行，而那是 Windows 上的主
// 消息循环线程 —— rusqlite 的每一次 WAL 提交都会按住 UI（审计项 H-3）。
//
// 也不用 `#[tauri::command(async)]`：那个属性对同步函数生成的是
// `respond_async_serialized(async move { 函数体 })`，函数体内联在 async block
// 里跑，只是把阻塞从主线程挪到了 tokio worker —— 而日志流、连接流跑的正是那
// 几个 worker。

use crate::errors::CommandError;
use crate::store::Store;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn enable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    store
        .run_blocking(crate::config::config_override::enable_config_override_inner)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn disable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    store
        .run_blocking(crate::config::config_override::disable_config_override_inner)
        .await
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
/// 抛出来的更贴合上下文。解析在进阻塞线程池**之前**做：它是纯 CPU 的，而且
/// 不合法时根本不需要碰数据库。
pub async fn save_config_override(
    store: State<'_, Store>,
    config: String,
) -> Result<(), CommandError> {
    let parsed: serde_json::Value = if config.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&config).map_err(|e| {
            CommandError::validation(format!("Config override is not valid JSON: {e}"))
        })?
    };
    store
        .run_blocking(move |store| {
            crate::config::config_override::save_config_override_inner(store, parsed)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    store
        .run_blocking(crate::config::config_override::clear_config_override_inner)
        .await
}

#[tauri::command]
#[specta::specta]
/// 返回覆盖层的 JSON 文本（见 `save_config_override` 里为什么是文本）。
pub async fn load_config_override(store: State<'_, Store>) -> Result<String, CommandError> {
    store
        .run_blocking(|store| {
            let value = crate::config::config_override::load_config_override_inner(store)?;
            serde_json::to_string_pretty(&value)
                .map_err(|e| CommandError::json("serialize config override", e))
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn is_config_override_enabled(store: State<'_, Store>) -> Result<bool, CommandError> {
    store
        .run_blocking(crate::config::config_override::is_config_override_enabled_inner)
        .await
}
