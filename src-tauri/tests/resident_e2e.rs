// 阶段 1 的验证：常驻订阅确实能对着真实 daemon 建立起来，并且在实例没跑的
// 时候安静地等待而不是打转。
//
// 和 `bridge_e2e.rs` 一样，需要一个开发用 daemon（见 `docs/development.md`）：
//
//   sing-box-daemon.exe run --listen 127.0.0.1:19090 --working-directory <tmp>
//
// 没起就跳过。
//
// 能验到的边界：开发直连模式下没法启动 sing-box 实例（`StartService` 在
// `DesktopService` 上，需要 peer identity），所以「实例跑起来之后 groups 有
// 内容」这一段只能靠签名安装手测。这里验的是没有实例时的行为 —— 恰恰是最容易
// 写错的那半：`SubscribeGroups`/`SubscribeClashMode` 都会在 daemon 的
// `waitForStarted` 上阻塞，实现必须是「安静地挂着」，而不是不断重试刷日志。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use fresh_box_lib::daemon::DaemonClient;
use fresh_box_lib::services::resident::{ResidentState, spawn_session};

const DEV_ADDR: &str = "127.0.0.1:19090";

fn daemon_is_listening() -> bool {
    use std::net::TcpStream;
    DEV_ADDR
        .parse()
        .ok()
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok())
        .is_some()
}

async fn connect() -> fresh_box_lib::daemon::DaemonConnection {
    // SAFETY: 单线程测试，在任何其他线程读环境变量之前设置。
    unsafe {
        std::env::set_var("FRESH_BOX_DAEMON_ADDR", DEV_ADDR);
    }
    DaemonClient::connect(&PathBuf::from("unused-in-dev-mode"))
        .await
        .expect("connect to the development daemon over TCP")
        .connection
}

#[tokio::test]
async fn session_subscriptions_wait_quietly_without_a_running_instance() {
    if !daemon_is_listening() {
        eprintln!("skipping: no development daemon on {DEV_ADDR}");
        return;
    }

    let resident = Arc::new(ResidentState::new());
    let connection = connect().await;
    let session = spawn_session(resident.clone(), connection);

    // 两条订阅都会在 `waitForStarted` 上挂住。给足够时间让「实现写错成重试
    // 打转」暴露出来 —— 那种写法会反复建流失败、也不会往状态里写东西。
    tokio::time::sleep(Duration::from_millis(800)).await;

    assert!(
        resident.groups().is_empty(),
        "no instance is running, so there should be no selectable groups"
    );
    assert!(
        resident.mode().available.is_empty(),
        "no instance is running, so no clash modes should be known"
    );

    drop(session);
}

#[tokio::test]
async fn dropping_the_session_guard_clears_resident_state() {
    if !daemon_is_listening() {
        eprintln!("skipping: no development daemon on {DEV_ADDR}");
        return;
    }

    let resident = Arc::new(ResidentState::new());
    let mut changes = resident.subscribe_groups();

    let session = spawn_session(resident.clone(), connect().await);
    tokio::time::sleep(Duration::from_millis(200)).await;

    // 会话结束必须把常驻状态清空，否则托盘会在断连后继续显示一份已经不对的
    // 节点列表 —— 这正是 `SessionGuard` 只走 `Drop` 收尾要保证的事。
    drop(session);

    tokio::time::timeout(Duration::from_secs(2), changes.changed())
        .await
        .expect("dropping the session guard must publish a state change")
        .expect("resident state channel stays open for the process lifetime");

    assert!(resident.groups().is_empty());
    assert!(resident.mode().available.is_empty());
}
