// resident.rs — Rust 自己作为 daemon 客户端所需的常驻状态。
//
// 为什么需要它：关闭主窗口会**销毁** webview（见 `main.rs` 的
// `CloseRequested` 处理），所以任何「关了窗口还得继续工作」的东西都不能住在
// 前端。目前是两件：托盘（要画节点/模式菜单、要能启停）和状态变化通知。
//
// 这不违反「不可以在 Rust 侧发明数据」：Rust 在这里是 daemon 的一个客户端，
// 和前端平级，它解码 `Groups`/`ClashMode` 是为了画自己的 UI（托盘）。被禁止
// 的是另一件事 —— 把解码后的结果重新打包成一个自创的形状，当作前端的数据源。
// 下面这些类型没有一个会跨过 IPC 边界：前端要代理组，走 bridge 自己订
// `SubscribeGroups`。同一条流两个独立消费者，中间零翻译。
//
// 生命周期：三条订阅（ServiceStatus 由 `services::singbox` 的
// reconciliation loop 自己持有，Groups 和 ClashMode 在这里）都绑定在一次
// 连接会话上。会话结束时取消并清空，托盘随之回到「未连接」的样子。
//
// 对照官方客户端的 `main/state.ts`：`loopConnection` 里 `void
// this.loopGroups(session.signal)` 就是同一个形状。

use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;

use crate::daemon::DaemonConnection;
use crate::services::singbox::{ConnectionPhase, SingboxState};

/// 一条订阅失败后重试前的等待 —— 对齐官方 `state.ts` 的 `RECONNECT_DELAY`。
/// 这两条流会在 daemon 的 `waitForStarted` 上阻塞到实例真的起来，所以正常
/// 情况下根本走不到重试；这个延迟防的是「订阅立刻出错」时的紧循环。
const RESUBSCRIBE_DELAY: Duration = Duration::from_secs(3);

/// 托盘节点子菜单需要的那点信息，从 `daemon_api::Group` 里摘出来。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TrayGroup {
    pub tag: String,
    pub selected: String,
    pub items: Vec<String>,
}

/// 托盘模式子菜单需要的信息。`available` 来自一次 `GetClashModeStatus`，
/// `current` 由 `SubscribeClashMode` 持续更新。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ModeState {
    pub available: Vec<String>,
    pub current: String,
}

/// 进程级常驻状态，作为 Tauri managed state 注册。托盘从这里读，
/// `spawn_session` 往这里写。
pub struct ResidentState {
    groups_tx: watch::Sender<Vec<TrayGroup>>,
    groups_rx: watch::Receiver<Vec<TrayGroup>>,
    mode_tx: watch::Sender<ModeState>,
    mode_rx: watch::Receiver<ModeState>,
}

impl ResidentState {
    pub fn new() -> Self {
        let (groups_tx, groups_rx) = watch::channel(Vec::new());
        let (mode_tx, mode_rx) = watch::channel(ModeState::default());
        Self {
            groups_tx,
            groups_rx,
            mode_tx,
            mode_rx,
        }
    }

    pub fn groups(&self) -> Vec<TrayGroup> {
        self.groups_rx.borrow().clone()
    }

    pub fn mode(&self) -> ModeState {
        self.mode_rx.borrow().clone()
    }

    pub fn subscribe_groups(&self) -> watch::Receiver<Vec<TrayGroup>> {
        self.groups_rx.clone()
    }

    pub fn subscribe_mode(&self) -> watch::Receiver<ModeState> {
        self.mode_rx.clone()
    }

    /// 会话结束时调用 —— 托盘立刻回到「没有节点、没有模式」的样子，而不是
    /// 继续显示一份已经不对的快照。
    fn clear(&self) {
        let _ = self.groups_tx.send(Vec::new());
        let _ = self.mode_tx.send(ModeState::default());
    }
}

impl Default for ResidentState {
    fn default() -> Self {
        Self::new()
    }
}

/// 会话取消信号：`true` = 这次连接已经结束，两条订阅都该退出。
/// 沿用 `services::streams` 里 `stop_rx` 的约定。
pub struct SessionGuard {
    tx: watch::Sender<bool>,
    resident: Arc<ResidentState>,
}

/// 收尾只走 `Drop`：`run_reconciliation_attempt` 里有多条提前 `return` 的
/// 路径（订阅失败、流断开），显式的 `end()` 迟早会漏掉一条。
impl Drop for SessionGuard {
    fn drop(&mut self) {
        let _ = self.tx.send(true);
        self.resident.clear();
    }
}

/// 为一次成功建立的连接启动 Groups / ClashMode 两条常驻订阅。
///
/// 返回的 `SessionGuard` 一旦 drop，两条订阅退出、常驻状态清空 —— 所以调用
/// 方只要把它留在会话作用域里就行，不需要记得手动收尾。
/// Clash 模式变化时的落盘回调。
///
/// 做成回调而不是让 `run_clash_mode` 自己去 Tauri managed state 里反查 Store：
/// 这样这个模块不依赖 Tauri 的状态容器，测试里给个空实现就能跑。
pub type ModeSink = Arc<dyn Fn(&str) + Send + Sync>;

/// 什么都不做的 `ModeSink` —— 集成测试用。
///
/// bin 目标看不到它的使用者（集成测试链接的是 lib 目标，而这个 crate 的
/// `main.rs` 和 `lib.rs` 各自声明了一遍 `mod services`，所以两份都会编译），
/// 于是 bin 那份会报 dead_code。
#[allow(dead_code)]
pub fn noop_mode_sink() -> ModeSink {
    Arc::new(|_| {})
}

pub fn spawn_session(
    resident: Arc<ResidentState>,
    connection: DaemonConnection,
    remember_mode: ModeSink,
) -> SessionGuard {
    let (tx, rx) = watch::channel(false);

    tauri::async_runtime::spawn(run_groups(resident.clone(), connection.clone(), rx.clone()));
    tauri::async_runtime::spawn(run_clash_mode(
        resident.clone(),
        connection,
        rx,
        remember_mode,
    ));

    SessionGuard { tx, resident }
}

/// 会话还活着就返回 `true`；被取消了返回 `false`。
async fn wait_before_resubscribe(cancel: &mut watch::Receiver<bool>) -> bool {
    tokio::select! {
        _ = tokio::time::sleep(RESUBSCRIBE_DELAY) => !*cancel.borrow(),
        result = cancel.changed() => result.is_ok() && !*cancel.borrow(),
    }
}

async fn run_groups(
    resident: Arc<ResidentState>,
    connection: DaemonConnection,
    mut cancel: watch::Receiver<bool>,
) {
    while !*cancel.borrow() {
        // 这里会阻塞到 sing-box 实例真的启动（daemon 的 `waitForStarted`），
        // 所以连上就订阅、由它自己等，比在这边轮询状态更省事也更准。
        match connection.subscribe_groups().await {
            Ok(mut stream) => loop {
                tokio::select! {
                    _ = cancel.changed() => return,
                    message = stream.message() => match message {
                        Ok(Some(groups)) => {
                            let _ = resident.groups_tx.send(to_tray_groups(groups));
                        }
                        // 流正常结束或出错都退到外层重订阅：实例停了、daemon
                        // 重启了，都属于「等一下再来」而不是「彻底放弃」。
                        _ => break,
                    },
                }
            },
            Err(e) => tracing::debug!(error = ?e, "resident: subscribe to proxy groups failed"),
        }

        if !wait_before_resubscribe(&mut cancel).await {
            return;
        }
    }
}

/// 只保留 daemon 自己标了 `selectable` 的组。
///
/// 比按 `type` 字符串猜（`selector`/`urltest`）准确：`urltest` 组是自动选路
/// 的，从托盘手点一个节点没有意义，而 `selectable` 正是 daemon 对「这个组
/// 能不能手动选」的回答。
fn to_tray_groups(groups: crate::daemon::daemon_api::Groups) -> Vec<TrayGroup> {
    groups
        .group
        .into_iter()
        .filter(|g| g.selectable)
        .map(|g| TrayGroup {
            tag: g.tag,
            selected: g.selected,
            items: g.items.into_iter().map(|item| item.tag).collect(),
        })
        .collect()
}

async fn run_clash_mode(
    resident: Arc<ResidentState>,
    connection: DaemonConnection,
    mut cancel: watch::Receiver<bool>,
    remember_mode: ModeSink,
) {
    while !*cancel.borrow() {
        match connection.subscribe_clash_mode().await {
            Ok(mut stream) => {
                // `SubscribeClashMode` 只推当前模式，不带可选模式列表。列表
                // 从 `GetClashModeStatus` 取一次就够 —— 它由配置决定，实例
                // 运行期间不会变。等第一条推送到达再取，因为那条推送到达就
                // 意味着实例已经 started，而 `GetClashModeStatus` 恰好要求
                // 这一点。
                let mut available: Vec<String> = Vec::new();
                loop {
                    tokio::select! {
                        _ = cancel.changed() => return,
                        message = stream.message() => match message {
                            Ok(Some(mode)) => {
                                if available.is_empty()
                                    && let Ok(status) = connection.clash_mode_status().await
                                {
                                    available = status.mode_list;
                                }
                                // 记住当前模式，下次启动实例时回填成
                                // `clash_api.default_mode`（审计项 M-09）。
                                remember_mode(&mode.mode);
                                let _ = resident.mode_tx.send(ModeState {
                                    available: available.clone(),
                                    current: mode.mode,
                                });
                            }
                            _ => break,
                        },
                    }
                }
            }
            Err(e) => tracing::debug!(error = ?e, "resident: subscribe to clash mode failed"),
        }

        if !wait_before_resubscribe(&mut cancel).await {
            return;
        }
    }
}

// ── 状态变化通知 ────────────────────────────────────────────────────────────

/// 把「sing-box 起了/停了/挂了/连接丢了」发成系统通知。
///
/// 这段逻辑原来在前端 `useDaemonConnection.ts` 的 `notifyOs` 里 —— 在销毁
/// 模式下等于不存在：窗口一关 webview 就没了，sing-box 崩溃时用户收不到
/// 任何提示。搬到这里之后它和进程同寿。
///
/// 窗口里的 toast 仍然留在前端：那是窗口内的 UI，本来就只在有窗口时才有
/// 意义，也不该和系统通知重复。
pub fn spawn_notifier(app: AppHandle, state: SingboxState) {
    tauri::async_runtime::spawn(async move {
        let mut rx = crate::services::singbox::subscribe(&state);
        // 用当前相位做基线，不为「应用启动时 sing-box 恰好已经在跑」发一条
        // 通知 —— 对齐前端原来 `announce=false` 的首帧处理。
        let mut was_running = rx.borrow().running();

        while rx.changed().await.is_ok() {
            let phase = rx.borrow().clone();
            let running = phase.running();
            if running == was_running {
                continue;
            }
            was_running = running;

            let (title, body) = match (&phase, running) {
                (_, true) => ("sing-box", "sing-box is running.".to_string()),
                (ConnectionPhase::Connected { status }, false)
                    if status.state == crate::services::singbox::SingboxRunState::Fatal =>
                {
                    let detail = if status.error_message.is_empty() {
                        "sing-box has stopped unexpectedly.".to_string()
                    } else {
                        format!(
                            "sing-box has stopped unexpectedly: {}",
                            status.error_message
                        )
                    };
                    ("sing-box", detail)
                }
                // Idle / Starting / Stopping —— 一次干净的停止，不管是谁发起的。
                (ConnectionPhase::Connected { .. }, false) => {
                    ("sing-box", "sing-box is stopped.".to_string())
                }
                // 整个掉出了 connected：丢的是 daemon 连接，不只是实例。
                // reconciliation loop 自己在重试。
                (_, false) => (
                    "sing-box",
                    "Lost connection to sing-box-daemon.".to_string(),
                ),
            };

            if let Err(e) = app.notification().builder().title(title).body(&body).show() {
                tracing::warn!(error = ?e, "failed to show state-change notification");
            }
        }
    });
}

// ── 托盘切换节点的副作用 ────────────────────────────────────────────────────

/// 关掉链路里经过 `group_tag` 的全部连接。
///
/// 前端有一份等价实现（`src/daemon/proxyActions.ts`），因为它本来就持有活跃
/// 连接表、不需要另开流。这里这一份是给**托盘**用的：窗口销毁后托盘还要能切
/// 节点，那时前端根本不存在。这是「关了窗口还得跑的留在 Rust」的直接后果，
/// 不是重复实现的疏忽。
///
/// 没有窗口就没有累加好的连接表，所以只能现开一条 `SubscribeConnections` 取
/// 第一帧 —— 上游订阅建立时会先发一份带 `reset` 的全量快照
/// （`started_service.go` 的 `buildInitialConnectionState`），正好够用。
pub async fn close_connections_by_group(connection: &DaemonConnection, group_tag: &str) {
    let mut stream = match connection.subscribe_connections(0).await {
        Ok(stream) => stream,
        Err(e) => {
            tracing::warn!(error = ?e, "tray: failed to subscribe to connections");
            return;
        }
    };

    let Ok(Some(frame)) = stream.message().await else {
        return;
    };
    // 快照读完就把流放掉，别为了一帧一直占着。
    drop(stream);

    for event in frame.events {
        let Some(conn) = event.connection else {
            continue;
        };
        if conn.chain_list.iter().any(|chain| chain == group_tag)
            && let Err(e) = connection.close_connection(conn.id).await
        {
            tracing::warn!(error = ?e, "tray: failed to close connection");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::daemon::daemon_api::{Group, GroupItem, Groups};

    // 两条订阅本身要真 daemon（`tests/resident_e2e.rs` 管那一半）。这里测的是
    // 它们写进/读出的那个状态容器，以及 `Groups` → 托盘菜单的那次摘取 ——
    // 托盘在窗口关掉之后就是靠这两样活着的。

    fn group(tag: &str, selectable: bool, selected: &str, items: &[&str]) -> Group {
        Group {
            tag: tag.to_string(),
            r#type: "selector".to_string(),
            selectable,
            selected: selected.to_string(),
            is_expand: false,
            items: items
                .iter()
                .map(|t| GroupItem {
                    tag: t.to_string(),
                    r#type: "shadowsocks".to_string(),
                    url_test_time: 0,
                    url_test_delay: 0,
                })
                .collect(),
        }
    }

    #[test]
    fn only_selectable_groups_reach_the_tray() {
        // 托盘菜单点一下就是切节点，所以「不能手动选」的组根本不该出现在
        // 那里 —— 和代理页 `toOverview` 的取舍一致，依据同样是 `selectable`。
        let groups = to_tray_groups(Groups {
            group: vec![
                group("manual", true, "a", &["a", "b"]),
                group("auto", false, "a", &["a"]),
            ],
        });
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].tag, "manual");
        assert_eq!(groups[0].selected, "a");
        assert_eq!(groups[0].items, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn an_empty_snapshot_produces_an_empty_menu() {
        assert!(to_tray_groups(Groups { group: vec![] }).is_empty());
    }

    #[test]
    fn a_fresh_state_holds_nothing() {
        let state = ResidentState::new();
        assert!(state.groups().is_empty());
        assert!(state.mode().available.is_empty());
        assert_eq!(state.mode().current, "");
    }

    #[test]
    fn readers_see_what_the_session_wrote() {
        let state = ResidentState::new();
        state
            .groups_tx
            .send(to_tray_groups(Groups {
                group: vec![group("manual", true, "b", &["a", "b"])],
            }))
            .expect("state channel stays open for the process lifetime");
        state
            .mode_tx
            .send(ModeState {
                available: vec!["rule".into(), "global".into()],
                current: "global".into(),
            })
            .expect("state channel stays open");

        assert_eq!(state.groups()[0].selected, "b");
        assert_eq!(state.mode().current, "global");
    }

    #[test]
    fn clearing_leaves_the_tray_showing_nothing_rather_than_a_stale_snapshot() {
        // 会话结束（`SessionGuard::drop`）会调这个。不清的话托盘会在断连后
        // 继续显示一份已经不对的节点列表，点下去还会报错。
        let state = ResidentState::new();
        state
            .groups_tx
            .send(vec![TrayGroup {
                tag: "manual".into(),
                selected: "a".into(),
                items: vec!["a".into()],
            }])
            .expect("send");
        state.clear();
        assert!(state.groups().is_empty());
        assert!(state.mode().available.is_empty());
    }

    #[tokio::test]
    async fn subscribers_are_woken_by_a_change() {
        // 托盘就是这么重画的 —— 收不到变化通知等于菜单永远停在第一帧。
        let state = ResidentState::new();
        let mut rx = state.subscribe_groups();
        state
            .groups_tx
            .send(vec![TrayGroup {
                tag: "manual".into(),
                selected: "a".into(),
                items: vec!["a".into()],
            }])
            .expect("send");

        tokio::time::timeout(std::time::Duration::from_secs(1), rx.changed())
            .await
            .expect("a change must wake the subscriber")
            .expect("channel stays open");
        assert_eq!(rx.borrow().len(), 1);
    }

    #[test]
    fn the_noop_mode_sink_swallows_everything() {
        let sink = noop_mode_sink();
        sink("rule");
        sink("");
    }
}
