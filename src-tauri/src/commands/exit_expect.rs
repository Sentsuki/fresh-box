// 期望出口的读写。按 **profile id** 收参，和 `check_config_fields` 一样 —— 前端
// 拿着的就是选中档案的 id。`async fn` + `run_blocking` 的理由见
// `commands::config_override` 顶部的注释（审计项 H-3）。

use crate::config::exit_expect::{self, ExitExpect};
use crate::errors::CommandError;
use crate::store::Store;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn load_exit_expect(
    store: State<'_, Store>,
    profile_id: String,
) -> Result<ExitExpect, CommandError> {
    store
        .run_blocking(move |store| exit_expect::load(store, &profile_id))
        .await
}

/// `node` 为 `None` 表示取消这个组的期望。返回改完之后的整张表。
#[tauri::command]
#[specta::specta]
pub async fn set_exit_expect(
    store: State<'_, Store>,
    profile_id: String,
    group: String,
    node: Option<String>,
) -> Result<ExitExpect, CommandError> {
    store
        .run_blocking(move |store| exit_expect::set(store, &profile_id, &group, node.as_deref()))
        .await
}
