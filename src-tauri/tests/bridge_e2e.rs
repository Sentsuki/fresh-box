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

use fresh_box_lib::daemon::daemon_api::Log;
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

    // 挑 `CloseAllConnections`，三个理由：
    //
    //  1. 它在白名单里（`build.rs` 的 `EXPOSED`）。这条测试走的是产品代码
    //     真正的那条路，包括 `allowlist::resolve` —— 拿一个只为测试方便而
    //     开放的方法来测，等于测了一条用户走不到的路。
    //  2. 它没有任何前置条件：`started_service.go` 里对 `instance` 和
    //     `trafficManager` 都是 nil 检查，不 `waitForStarted`、不看
    //     `serviceStatus`。而开发直连模式下永远不可能有跑着的实例 —— 启动
    //     实例要走 `DesktopService`，那半边在这个模式下正好是不通的（见下面
    //     那条测试）。既然没有实例，这次调用也就没有副作用可言。
    //  3. 它的响应是 `Empty` —— **零字节**。这恰好是 `BytesCodec` 里唯一真正
    //     危险的那条路径：`decode` 若把零长载荷当成 `None`，tonic 会理解成
    //     「这一帧还没收全」而永久等待。`codec.rs` 有单元测试钉它，这里让它
    //     真的过一趟 socket。
    let response = bridge::unary(
        client.connection.raw_channel(),
        "daemon.StartedService",
        "CloseAllConnections",
        Vec::new(),
    )
    .await
    .expect("CloseAllConnections through the byte-passthrough bridge");

    assert!(
        response.is_empty(),
        "an Empty response is zero bytes, and must survive as zero bytes — got {} byte(s)",
        response.len()
    );
    eprintln!("bridge round-trip ok: empty response survived the codec");
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

    // 走**类型化 client**，不走 bridge —— 现在整个 `DesktopService` 都不在
    // 白名单里（`build.rs` 的 `EXPOSED`），从 bridge 调它会在字节碰到网络
    // 之前就被 `allowlist::resolve` 拦下，那样这条测试断言的就变成我们自己的
    // 策略，而不是它想记录的那个 boxdd 事实了。Rust 自己的常驻逻辑用的正是
    // 这条类型化路径，所以这也是这个限制真正会绊到人的地方。
    let error = client
        .connection
        .daemon_info()
        .await
        .expect_err("DesktopService needs a peer identity that TCP mode cannot provide");

    // 这个错误本身就是一次成功的往返：请求过了网络、daemon 分发到了处理器、
    // 处理器拒绝了、状态码原路回来。
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
        client.connection.raw_channel(),
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

// ── 阶段 2：服务端流 ────────────────────────────────────────────────────────

/// `SubscribeLog` 是白名单里唯一一条既不需要 peer identity、也不需要实例已启动
/// 的服务端流：`started_service.go` 在订阅建立时无条件 `Send` 一帧
/// `Log{reset: true}`（哪怕一条日志都还没有），既不 `waitForStarted` 也不看
/// `serviceStatus`。所以它是开发模式下唯一能真正跑通的流式往返。
#[tokio::test]
async fn server_streaming_delivers_a_real_frame() {
    if !daemon_is_listening() {
        eprintln!("skipping: no development daemon on {DEV_ADDR}");
        return;
    }

    // SAFETY: 单线程测试，在任何其他线程读环境变量之前设置。
    unsafe {
        std::env::set_var("FRESH_BOX_DAEMON_ADDR", DEV_ADDR);
    }

    let client = DaemonClient::connect(&PathBuf::from("unused-in-dev-mode"))
        .await
        .expect("connect to the development daemon over TCP");

    let mut stream = bridge::server_streaming(
        client.connection.raw_channel(),
        "daemon.StartedService",
        "SubscribeLog",
        Vec::new(),
    )
    .await
    .expect("SubscribeLog through the byte-passthrough bridge");

    let payload = tokio::time::timeout(std::time::Duration::from_secs(3), stream.message())
        .await
        .expect("the daemon sends the saved log lines immediately on subscribe")
        .expect("stream is healthy")
        .expect("first frame is present");

    // Rust 全程没解析过 —— 解一次只为断言这确实是前端会拿到的那串字节。
    let log = Log::decode(payload.as_ref()).expect("frame decodes as a Log");
    assert!(
        log.reset,
        "the first frame is the initial snapshot, so it carries reset=true"
    );
    eprintln!(
        "streaming round-trip ok: {} saved line(s) ({} bytes)",
        log.messages.len(),
        payload.len()
    );
}

/// 一元方法当成流来订阅必须被拒 —— 而且要在字节碰到网络之前拒。
#[tokio::test]
async fn server_streaming_rejects_a_unary_method() {
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

    let error = bridge::server_streaming(
        client.connection.raw_channel(),
        "daemon.StartedService",
        "CloseAllConnections",
        Vec::new(),
    )
    .await
    .expect_err("CloseAllConnections is unary, not server-streaming");
    assert!(matches!(
        error,
        fresh_box_lib::CommandError::ValidationError(_)
    ));
}

/// 丢掉 `Streaming` 会让 tonic 关掉这条 gRPC 流 —— 这是 `StreamRegistry` 用
/// `AbortHandle` 取消任务时依赖的机制：任务被 abort → future 被 drop →
/// `Streaming` 被 drop → 流关闭。这里验证 drop 之后还能正常再开一条，即上一条
/// 确实没把连接卡住。
#[tokio::test]
async fn dropping_a_stream_releases_it() {
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

    for round in 0..20 {
        let mut stream = bridge::server_streaming(
            client.connection.raw_channel(),
            "daemon.StartedService",
            "SubscribeLog",
            Vec::new(),
        )
        .await
        .unwrap_or_else(|e| panic!("round {round}: subscribe failed: {e}"));

        tokio::time::timeout(std::time::Duration::from_secs(3), stream.message())
            .await
            .unwrap_or_else(|_| panic!("round {round}: no frame"))
            .unwrap_or_else(|e| panic!("round {round}: stream error: {e}"));

        drop(stream);
    }
}
