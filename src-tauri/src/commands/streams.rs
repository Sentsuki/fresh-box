use crate::errors::CommandError;
use crate::services::singbox::SingboxState;
use crate::services::streams::StreamsState;
use tauri::State;

// 流量 / 内存 / 日志的命令已在阶段 2 删除 —— 前端现在通过 bridge 直接订阅
// daemon（`src/daemon/statusStream.ts`、`src/hooks/useLogsStream.ts`）。
// 连接流是阶段 3 的最后一块。

#[tauri::command]
pub async fn start_connections_stream(
    app: tauri::AppHandle,
    state: State<'_, StreamsState>,
    singbox: State<'_, SingboxState>,
) -> Result<(), CommandError> {
    crate::services::streams::start_connections_stream(app, state, singbox).await
}

#[tauri::command]
pub async fn stop_connections_stream(state: State<'_, StreamsState>) -> Result<(), CommandError> {
    crate::services::streams::stop_connections_stream(state).await
}
