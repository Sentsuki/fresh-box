// 阶段 5 的验收：服务探测确实按退出码区分三态（审计项 H-04）。
//
// 这条不需要开发 daemon —— 它跑的是 `sing-box-daemon.exe service status`，
// 查的是本机 Windows 服务数据库的真实状态。仓库里的 daemon 二进制存在就能跑。
//
// 以前只有 `sc query` 一个布尔，「装了但没在跑」——最常见的一类故障——会落进
// `Unavailable { 原始 IO 错误 }`，用户看不懂也没有对症按钮。

use fresh_box_lib::daemon::install::{ServiceStatus, probe_service};

/// 直接验退出码约定，不经过 `probe_service` 的路径解析。
///
/// `daemon_executable_path()` 是相对当前 exe 解析的，测试二进制下必然指向
/// `target/debug/deps/resources/...`（不存在），所以这里用仓库里那份二进制，
/// 它和安装版是同一个文件。
#[test]
fn service_status_exit_codes_match_what_the_probe_expects() {
    let bundled = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("daemon")
        .join("sing-box-daemon.exe");
    if !bundled.exists() {
        eprintln!("skipping: no daemon binary at {}", bundled.display());
        return;
    }

    let output = std::process::Command::new(&bundled)
        .args(["service", "status"])
        .output()
        .expect("run `sing-box-daemon service status`");
    let code = output.status.code().expect("a real exit code");
    let description = String::from_utf8_lossy(&output.stdout).trim().to_string();

    eprintln!("service status -> {code} ({description})");
    // 三个已知码来自上游 `cmd_service_windows.go` 的 `serviceStatus`。这条
    // 测试变红意味着上游改了约定 —— 那 `probe_service` 的映射也必须跟着改。
    let expected = match code {
        0 => "running",
        2 => "stopped",
        3 => "not installed",
        other => panic!("unexpected exit code {other} ({description}) — upstream changed?"),
    };
    assert_eq!(
        description, expected,
        "exit code {code} must mean {expected:?}"
    );
}

#[test]
fn is_service_installed_agrees_with_the_probe() {
    // 两个函数必须给出一致的答案 —— `is_service_installed` 只是 probe 的一个
    // 视图，不该有独立的判断逻辑。
    let status = probe_service();
    let installed = fresh_box_lib::daemon::install::is_service_installed();
    let expected = matches!(status, ServiceStatus::Running | ServiceStatus::NotRunning);
    assert_eq!(installed, expected, "probe said {status:?}");
}
