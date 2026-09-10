// core.rs — Advanced 页「sing-box Core」那一栏的三件事：核心版本、工作目录
// 大小、销毁工作目录。
//
// 对齐官方客户端 `src/main/core.ts` 的 `info` / `workingDirectory` /
// `destroyWorkingDirectory`，但销毁那条**有意和官方不一样**：官方会替用户
// 把服务停掉再删，这里只是拒绝并让用户自己去停，见
// `destroy_working_directory`。
//
// 三个都做成 host 命令而不是让前端直接打 gRPC：销毁要在调用前判断实例状态，
// 版本和大小则是为了和它待在同一层，前端拿到的是三个语义完整的动作。

use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};
use tauri::State;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CoreInfo {
    /// daemon 自报的版本。sing-box-daemon.exe 就是核心本身，所以这也是核心
    /// 版本 —— 官方客户端在 Core 设置页显示的是同一个值。
    pub version: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkingDirectoryView {
    pub path: String,
    /// 字节数。
    ///
    /// `f64` 而不是 `i64`：specta 拒绝导出 64 位整数（它在 JS 里就是
    /// `number`，超过 2^53 会静默丢精度），而 JS 的 `number` 本来就是 f64。
    /// 同 `DiagnosticsSettings::oom_memory_limit_mb` 的取舍。
    pub size: f64,
}

/// 当前连着的 daemon 的版本。
#[tauri::command]
#[specta::specta]
pub async fn get_core_info(state: State<'_, SingboxState>) -> Result<CoreInfo, CommandError> {
    let connection = get_connection(state.inner()).await?;
    let info = connection.daemon_info().await?;
    Ok(CoreInfo {
        version: info.version,
    })
}

/// daemon 每用户工作目录的路径和总大小。
///
/// 大小是 daemon 侧递归遍历算出来的，不是一次 `stat`，目录大的时候这个调用
/// 本身就慢 —— 前端当作一次「慢读」来画（转圈 / 失败显示 Unavailable），别
/// 拿它轮询。
#[tauri::command]
#[specta::specta]
pub async fn get_working_directory(
    state: State<'_, SingboxState>,
) -> Result<WorkingDirectoryView, CommandError> {
    let connection = get_connection(state.inner()).await?;
    let info = connection.working_directory().await?;
    Ok(WorkingDirectoryView {
        path: info.path,
        size: info.size as f64,
    })
}

/// 删掉 daemon 的每用户工作目录（缓存库、下载的规则集等）。
///
/// 有实例跑着的时候**不销毁、也不代劳去停**，直接回一个 `InvalidState` 让
/// 前端提示用户自己停。官方客户端在这里是替用户停掉服务再销毁的
/// （`core.ts` 的 `destroyWorkingDirectory`），这里有意不跟 —— 「删缓存」
/// 和「把代理断掉」是两件事，一个按钮顺手做掉第二件，对正连着的用户来说是
/// 个没打招呼的副作用。
///
/// 这层检查不是唯一的保险：daemon 自己也会拒（上游 `desktop_service.go`
/// 的 `FailedPrecondition`），所以先查一遍再调，中间被别处启动了也删不掉。
/// 提前查只是为了给出一句人话，而不是把 gRPC 的状态码摆到用户脸上。
#[tauri::command]
#[specta::specta]
pub async fn destroy_working_directory(
    state: State<'_, SingboxState>,
) -> Result<(), CommandError> {
    if crate::services::singbox::get_daemon_state(state.inner()).running() {
        return Err(CommandError::InvalidState(
            "sing-box is running — stop it before destroying the working directory".to_string(),
        ));
    }
    let connection = get_connection(state.inner()).await?;
    connection.destroy_working_directory().await
}
