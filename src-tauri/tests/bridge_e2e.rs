// 阶段 0 的端到端验证：让一个真实的 protobuf 字节串走完
// 「编码 → bridge 字节透传 → gRPC → sing-box-daemon → 原路返回 → 解码」，
// 证明 `BytesCodec` 这条路在运行时也成立，而不只是类型检查通过。
//
// 这条测试不经过 Tauri 的 IPC 那一跳（那需要一个真实窗口），但 IPC 之下的
// 每一层都是产品代码本身：`DaemonClient::connect`、`daemon::bridge::unary`、
// `allowlist::resolve`、`BytesCodec`。
//
// 为什么必须靠一个开发用的 daemon 实例：boxdd 的对端认证要求 worker 的父
// 进程是安装目录里那个签名的 `sing-box.exe`（见 `daemon::worker` 的模块
// 注释），`cargo test` 的测试二进制永远不满足。boxdd 自己给了出口 ——
// `sing-box-daemon run --listen <addr>` 走 TCP 并整个关掉对端认证，正是
// `daemon::dev_daemon_address` 对接的东西。
//
// 起一个：
//   sing-box-daemon.exe run --listen 127.0.0.1:19090 --working-directory <tmp>
//
// 没起的话这条测试会跳过而不是失败 —— 它依赖一个外部进程，不该在没有那个
// 进程的机器上把 CI 弄红。

use std::path::PathBuf;

use fresh_box_lib::daemon::daemon_api::StartedAt;
use fresh_box_lib::daemon::{DaemonClient, bridge};
use prost::Message as _;

const DEV_ADDR: &str = "127.0.0.1:19090";

/// TCP 探活，用来决定是跑还是跳过。比直接尝试 gRPC 连接快，失败信息也更清楚。
fn daemon_is_listening() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;
    DEV_ADDR
        .parse()
        .ok()
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok())
        .is_some()
}

#[tokio::test]
async fn bridge_round_trips_a_real_protobuf_message() {
    if !daemon_is_listening() {
        eprintln!(
            "skipping: no development daemon on {DEV_ADDR} — start one with \
             `sing-box-daemon run --listen {DEV_ADDR} --working-directory <tmp>`"
        );
        return;
    }

    // SAFETY: 单线程测试，在任何其他线程读环境变量之前设置。
    unsafe {
        std::env::set_var("FRESH_BOX_DAEMON_ADDR", DEV_ADDR);
    }

    // 开发直连模式下这个路径不会被用到（不 spawn worker），但签名要求给一个。
    let client = DaemonClient::connect(&PathBuf::from("unused-in-dev-mode"))
        .await
        .expect("connect to the development daemon over TCP");

    // 选 `GetClashModeStatus` 而不是 `GetDaemonInfo`，理由有二，都值得记下来：
    //
    //  1. `DesktopService` 的每个方法开头都调 `peerIdentityFromContext`
    //     （desktop_service.go 里 10 处），而 `--listen` 模式只关掉了传输层
    //     凭据、没有伪造出 peer identity —— Windows 上会走
    //     `platformFallbackPeerIdentity` 直接返回
    //     "missing Windows peer authentication"。所以整个 DesktopService 在
    //     开发直连模式下都调不通。
    //  2. `StartedService` 一处都不需要 peer identity（started_service.go 里
    //     0 处），所以它整个可以在开发模式下用 —— 而重构里工作量最大的部分
    //     （代理组、连接、日志、流量、模式、测速）恰好全在 StartedService。
    //
    // 具体挑 `GetStartedAt`：它是 StartedService 里唯一一个完全没有前置条件的
    // 方法（既不 `waitForStarted`，也不检查 `serviceStatus`），所以不需要先有
    // 一个跑着的 sing-box 实例 —— 而启动实例又要走 DesktopService，在开发
    // 模式下正好是不通的那一半。
    let response = bridge::unary(
        &client.connection,
        "daemon.StartedService",
        "GetStartedAt",
        Vec::new(),
    )
    .await
    .expect("GetStartedAt through the byte-passthrough bridge");

    // Rust 侧全程没有解析过这些字节 —— 这里解一次只是为了断言它们确实是一条
    // 结构正确的消息，也就是前端会拿到的同一串字节。
    let started = StartedAt::decode(response.as_slice())
        .expect("bridge response decodes as a StartedAt");

    eprintln!(
        "bridge round-trip ok: startedAt={} ({} bytes over the wire)",
        started.started_at,
        response.len()
    );
}

/// `DesktopService` 在开发直连模式下用不了，是 boxdd 的设计使然而不是 bridge
/// 的问题 —— 把这个事实钉成一条测试，免得下次有人对着
/// "missing Windows peer authentication" 去 debug bridge。
#[tokio::test]
async fn desktop_service_is_unreachable_in_dev_mode() {
    if !daemon_is_listening() {
        eprintln!("skipping: no development daemon on {DEV_ADDR}");
        return;
    }

    // SAFETY: 同上。
    unsafe {
        std::env::set_var("FRESH_BOX_DAEMON_ADDR", DEV_ADDR);
    }

    let client = DaemonClient::connect(&PathBuf::from("unused-in-dev-mode"))
        .await
        .expect("connect to the development daemon over TCP");

    let error = bridge::unary(
        &client.connection,
        "desktop.DesktopService",
        "GetDaemonInfo",
        Vec::new(),
    )
    .await
    .expect_err("DesktopService needs a peer identity that TCP mode cannot provide");

    // 这个错误本身就是一次成功的往返：请求过了网络、daemon 分发到了处理器、
    // 处理器拒绝了、状态码原路回来被 BytesCodec 解出来。
    let message = format!("{error}");
    assert!(
        message.contains("peer authentication"),
        "expected boxdd's peer-authentication rejection, got: {message}"
    );
}

#[tokio::test]
async fn bridge_refuses_a_method_that_is_not_exposed() {
    if !daemon_is_listening() {
        eprintln!("skipping: no development daemon on {DEV_ADDR}");
        return;
    }

    // SAFETY: 同上。
    unsafe {
        std::env::set_var("FRESH_BOX_DAEMON_ADDR", DEV_ADDR);
    }

    let client = DaemonClient::connect(&PathBuf::from("unused-in-dev-mode"))
        .await
        .expect("connect to the development daemon over TCP");

    // 这条守的是一条安全线：`StartService` 是唯一能让调用方任意指定 sing-box
    // 配置内容的 RPC。allowlist 必须在字节碰到网络之前就拦下它 —— 这里连的
    // daemon 是真的，所以拦不住就真的会启动一个实例。
    let error = bridge::unary(
        &client.connection,
        "desktop.DesktopService",
        "StartService",
        Vec::new(),
    )
    .await
    .expect_err("StartService must never be reachable through the bridge");

    assert!(
        matches!(error, fresh_box_lib::CommandError::PermissionDenied(_)),
        "expected PermissionDenied, got {error:?}"
    );
}
