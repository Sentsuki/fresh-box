// daemon 域的 IPC 入口 —— 整个 daemon 域在 Rust 侧只有这么一个命令
// （阶段 2 会再加 `daemon_stream` / `daemon_cancel`）。
//
// 对比一下现状：`commands/{proxy,streams,tools,reports}.rs` 加起来几十个
// 命令，每个都认识一条具体的 RPC。这里一个都不认识。

use tauri::State;

use crate::errors::CommandError;
use crate::services::singbox::SingboxState;

/// 转发一次一元 gRPC 调用到 sing-box-daemon，返回响应的原始 protobuf 字节。
///
/// `request` 目前以 JSON 数字数组过界（Tauri 命令参数默认走 JSON）。一元
/// 请求都很小（`GetDaemonInfo` 是 `Empty`，0 字节），阶段 0 不值得为它引入
/// `tauri::ipc::Request` 的裸 body 形式；真正在意吞吐的是阶段 2 的流式
/// 通道，那边一开始就用 `Channel<InvokeResponseBody>` 走二进制。
///
/// 返回值走 `tauri::ipc::Response`，它对应 `InvokeResponseBody::Raw`，前端
/// 拿到的是 `ArrayBuffer` 而不是数字数组 —— 响应可能不小（比如
/// `ListCrashReports`），这一侧值得一开始就走二进制。
#[tauri::command]
pub async fn daemon_unary(
    state: State<'_, SingboxState>,
    service: String,
    method: String,
    request: Vec<u8>,
) -> Result<tauri::ipc::Response, CommandError> {
    // 复用 reconciliation loop 已经建立好的连接，不自己另开一条 —— bridge
    // 是那条连接上的又一个使用者，和托盘、和 `DaemonSession` 自己平级。
    // 没连上时这里返回 `ProcessNotRunning`，前端据此走 `DaemonGate` 的相位
    // 分支，而不是把它当成这次调用本身的失败。
    let connection = crate::services::singbox::get_connection(state.inner()).await?;
    let bytes = crate::daemon::bridge::unary(&connection, &service, &method, request).await?;
    Ok(tauri::ipc::Response::new(bytes))
}
