// daemon 域的 IPC 入口 —— 整个 daemon 域在 Rust 侧只有这三个命令。
//
// 对比一下现状：`commands/{proxy,streams,tools,reports}.rs` 加起来几十个
// 命令，每个都认识一条具体的 RPC。这三个一个都不认识。

use tauri::State;
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::daemon::bridge::{self, frame, registry::StreamRegistry};
use crate::errors::CommandError;
use crate::services::singbox::SingboxState;

/// 转发一次一元 gRPC 调用到 sing-box-daemon，返回响应的原始 protobuf 字节。
///
/// `request` 目前以 JSON 数字数组过界（Tauri 命令参数默认走 JSON）。一元
/// 请求都很小（`GetDaemonInfo` 是 `Empty`，0 字节；订阅请求也只有一个
/// interval），阶段 0/2 都不值得为它引入 `tauri::ipc::Request` 的裸 body 形式。
///
/// 返回值走 `tauri::ipc::Response`，对应 `InvokeResponseBody::Raw`，前端拿到
/// 的是 `ArrayBuffer` 而不是数字数组 —— 响应可能不小（比如
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
    // 没连上时这里返回 `ProcessNotRunning`，前端据此走相位分支，而不是把它
    // 当成这次调用本身的失败。
    let connection = crate::services::singbox::get_connection(state.inner()).await?;
    let bytes = bridge::unary(&connection, &service, &method, request).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 建立一条服务端流，逐帧推给 `on_event`，返回可用于 `daemon_cancel` 的流 id。
///
/// 每个订阅者拿到自己的 `Channel`，不是从前那种 `app.emit` 全局广播 —— 两个
/// 组件订阅同一条 RPC 互不干扰，也不会出现「每类流只有一个槽位」的限制。
///
/// 流的归属是**窗口**而不是进程：`window` 参数由 Tauri 注入，用它把流登记进
/// `StreamRegistry`，窗口销毁时（销毁模式下每次关闭都会发生）一并取消。见
/// `daemon::bridge::registry` 的模块注释。
#[tauri::command]
pub async fn daemon_stream(
    state: State<'_, SingboxState>,
    registry: State<'_, StreamRegistry>,
    window: tauri::Window,
    service: String,
    method: String,
    request: Vec<u8>,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u32, CommandError> {
    let connection = crate::services::singbox::get_connection(state.inner()).await?;
    // 建流失败直接作为命令的错误返回，不用绕 `on_event` —— 前端的
    // `transport.stream()` 在这里 await，能直接拿到一个 rejected promise。
    let mut stream = bridge::server_streaming(&connection, &service, &method, request).await?;

    let id = registry.next_id();
    let label = window.label().to_string();
    let registry_for_task = registry.inner().clone();
    let label_for_task = label.clone();

    // 用 `tokio::spawn` 而不是 `tauri::async_runtime::spawn`：只有前者给得出
    // `AbortHandle`，而注册表正是靠它取消。命令本身跑在 Tauri 的 tokio 运行时
    // 上，所以这里有运行时上下文（`services/streams.rs` 也是这么做的）。
    let task = tokio::spawn(async move {
        loop {
            match stream.message().await {
                Ok(Some(payload)) => {
                    // send 失败 = webview 已经没了。这是第二道保险：
                    // `WindowEvent::Destroyed` 是第一道，但那条事件万一没触发，
                    // 这里还能兜住。
                    if on_event
                        .send(InvokeResponseBody::Raw(frame::message(&payload)))
                        .is_err()
                    {
                        break;
                    }
                }
                Ok(None) => {
                    let _ = on_event.send(InvokeResponseBody::Raw(frame::end()));
                    break;
                }
                Err(status) => {
                    let _ = on_event.send(InvokeResponseBody::Raw(frame::error(&format!(
                        "{} ({:?})",
                        status.message(),
                        status.code()
                    ))));
                    break;
                }
            }
        }
        // 自己跑完就自己注销 —— 这里只是从表里摘掉，没什么可 abort 的。
        registry_for_task.remove(&label_for_task, id);
    });

    registry.insert(&label, id, task.abort_handle());
    Ok(id)
}

/// 取消一条流。前端在 `AbortSignal` 触发时调用（组件卸载、切页面……）。
///
/// 窗口整个销毁时不需要前端调这个：`WindowEvent::Destroyed` 会把该窗口名下
/// 的流全部取消，而那时 webview 已经跑不了任何代码了。
#[tauri::command]
pub fn daemon_cancel(registry: State<'_, StreamRegistry>, window: tauri::Window, id: u32) {
    registry.cancel(window.label(), id);
}
