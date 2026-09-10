// bridge 的能力边界 —— 前端能调到哪些 daemon RPC，全在这张表里。
//
// 表由 `build.rs` 从 `proto/` 下的 `.proto` 扫描生成（见那里的
// `generate_method_table`），所以「有哪些方法」永远和 vendored proto 一致；
// 而「其中哪些开给前端」是一份显式白名单（`build.rs` 的 `EXPOSED`），默认
// 不给。两者都在构建期核对：白名单里写了个不存在的方法，构建直接失败。
//
// 官方客户端的 `bridge.ts` 是「4 个服务上的任意方法都放行」。fresh-box 紧
// 两档：方法必须存在于 vendored proto，而且必须在 `EXPOSED` 里 —— 目前 15
// 条，全部落在 `StartedService` 与 `ApplicationService` 上。整个
// `DesktopService` 和 `ManagedService` 一条都不开，它们的能力由 host 域的
// 命令提供（那里有守卫和人话错误）。

use tonic::codegen::http::uri::PathAndQuery;

use crate::errors::CommandError;

/// 一条 gRPC 方法。`path` 是预拼好的 `/包名.服务名/方法名`，这样运行时
/// 不需要每次调用都格式化字符串再解析一遍 URI。
#[derive(Debug, Clone, Copy)]
pub struct MethodEntry {
    pub service: &'static str,
    pub method: &'static str,
    pub path: &'static str,
    pub server_streaming: bool,
    /// `false` = 这个方法存在，但故意不通过 bridge 暴露给前端。
    pub exposed: bool,
}

include!(concat!(env!("OUT_DIR"), "/daemon_methods.rs"));

/// 调用方期望的方法形态。传错了会被拒绝 —— 一元方法当成流来订阅（或者反过来）
/// 是 bug，不该等到 tonic 那边才以更难懂的形式报出来。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodKind {
    Unary,
    ServerStreaming,
}

impl MethodKind {
    fn describe(self) -> &'static str {
        match self {
            MethodKind::Unary => "unary",
            MethodKind::ServerStreaming => "server-streaming",
        }
    }
}

/// 查表并校验，返回可以直接交给 `tonic::client::Grpc` 的路径。
///
/// 四种失败分别给不同的话术，因为它们对前端开发者意味着完全不同的下一步：
/// 服务不存在 → 名字拼错了或 proto 没 vendor；方法不存在 → 同上；
/// 形态不符 → 该用 `daemon_stream` 而不是 `daemon_unary`（或反之）；
/// 故意不暴露 → 别绕，去用 host 域的命令。
pub fn resolve(
    service: &str,
    method: &str,
    kind: MethodKind,
) -> Result<PathAndQuery, CommandError> {
    let Some(entry) = METHODS
        .iter()
        .find(|e| e.service == service && e.method == method)
    else {
        let known_service = METHODS.iter().any(|e| e.service == service);
        return Err(CommandError::validation(if known_service {
            format!("unknown daemon method '{service}/{method}'")
        } else {
            format!("unknown daemon service '{service}' (not vendored in proto/, or misspelled)")
        }));
    };

    if !entry.exposed {
        return Err(CommandError::permission_denied(format!(
            "'{service}/{method}' is not exposed over the daemon bridge — if the frontend is \
             meant to call it, add it to EXPOSED in build.rs (and read that list's doc comment \
             first: some of these deliberately go through a host command instead)"
        )));
    }

    let expected = if entry.server_streaming {
        MethodKind::ServerStreaming
    } else {
        MethodKind::Unary
    };
    if expected != kind {
        return Err(CommandError::validation(format!(
            "'{service}/{method}' is {}, not {}",
            expected.describe(),
            kind.describe()
        )));
    }

    Ok(PathAndQuery::from_static(entry.path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_generated_and_non_empty() {
        assert!(!METHODS.is_empty());
    }

    #[test]
    fn every_path_parses_as_a_uri() {
        // `resolve` 用 `from_static`，它在路径非法时会 panic 而不是返回错误。
        // 表是生成的，路径理应总是合法 —— 这条测试就是防止生成器哪天改坏。
        for entry in METHODS {
            let parsed = PathAndQuery::from_static(entry.path);
            assert_eq!(parsed.path(), entry.path);
        }
    }

    #[test]
    fn resolves_a_known_unary_method() {
        let path = resolve(
            "daemon.StartedService",
            "GetClashModeStatus",
            MethodKind::Unary,
        )
        .expect("GetClashModeStatus is a unary method on StartedService");
        assert_eq!(path.path(), "/daemon.StartedService/GetClashModeStatus");
    }

    #[test]
    fn resolves_a_known_streaming_method() {
        let path = resolve(
            "daemon.StartedService",
            "SubscribeGroups",
            MethodKind::ServerStreaming,
        )
        .expect("SubscribeGroups is server-streaming on StartedService");
        assert_eq!(path.path(), "/daemon.StartedService/SubscribeGroups");
    }

    #[test]
    fn the_offline_connectivity_tests_are_reachable() {
        // 这两条住在 **worker 自己的管道**上（见 `commands::bridge::channel_for`），
        // 不需要 daemon 服务在跑 —— 那正是它们存在的意义，所以它们是
        // `ApplicationService` 上仅有的两条对前端开放的方法。
        for method in [
            "StartStandaloneNetworkQualityTest",
            "StartStandaloneSTUNTest",
        ] {
            resolve(
                "desktop.ApplicationService",
                method,
                MethodKind::ServerStreaming,
            )
            .unwrap_or_else(|e| panic!("{method} must resolve as server-streaming: {e:?}"));
        }
    }

    #[test]
    fn rusts_own_application_service_methods_are_not_reachable() {
        // 配置校验和 `.bpf` 编解码是 Rust 自己的事（`daemon::validate` /
        // `daemon::profile`），走类型化 client，不该从 webview 直接发起 ——
        // 校验尤其如此：`start_with_profile` 校验的是**三层合并之后**的内容，
        // 前端自己校验一份原文没有意义。
        for method in [
            "CheckConfig",
            "FormatConfig",
            "EncodeProfile",
            "DecodeProfile",
        ] {
            let error = resolve("desktop.ApplicationService", method, MethodKind::Unary)
                .expect_err("{method} must not be reachable from the webview");
            assert!(matches!(error, CommandError::PermissionDenied(_)));
        }
    }

    #[test]
    fn the_whole_desktop_and_managed_services_are_off_limits() {
        // 这条守的是一条边界，不是某个实现细节：`DesktopService` 的能力
        // （销毁工作目录、接管 daemon、导出/删除报告）和 `ManagedService`
        // 的停止实例，在 host 域各有一个带守卫、带人话错误的入口，前端走
        // 那条。`StartService` 更是唯一能让调用方任意指定**配置内容**的
        // RPC —— 开给 webview 等于交出任意出站/TUN/流量拦截。
        //
        // 它变红说明有人（或某次 proto 更新加上一次疏忽的 `EXPOSED` 编辑）
        // 把这两个 service 的门重新打开了。
        for entry in METHODS {
            if entry.service == "desktop.DesktopService" || entry.service == "daemon.ManagedService"
            {
                assert!(
                    !entry.exposed,
                    "{}/{} must not be exposed over the bridge",
                    entry.service, entry.method
                );
            }
        }
    }

    #[test]
    fn the_exposed_surface_is_small_and_lives_where_it_should() {
        // 白名单是显式的，所以「它有多大」本身就是一个值得钉住的事实：
        // 数字变了，就该有人在 review 里解释为什么。
        let exposed: Vec<_> = METHODS.iter().filter(|e| e.exposed).collect();
        assert_eq!(exposed.len(), 15, "exposed surface changed — intentional?");
        for entry in exposed {
            assert!(
                entry.service == "daemon.StartedService"
                    || entry.service == "desktop.ApplicationService",
                "unexpected service on the exposed surface: {}",
                entry.service
            );
        }
    }

    #[test]
    fn rejects_a_kind_mismatch() {
        let error = resolve(
            "daemon.StartedService",
            "SubscribeGroups",
            MethodKind::Unary,
        )
        .expect_err("subscribing method must not resolve as unary");
        assert!(matches!(error, CommandError::ValidationError(_)));
    }

    #[test]
    fn rejects_start_service_as_deliberately_hidden() {
        // 上一条按 service 整体守边界，这一条单独点名 `StartService`：它是
        // 那批里唯一一条**安全**性质的（任意配置内容 = 任意出站/TUN/拦截），
        // 其余更多是「有更好的入口」。名字留在测试列表里，为的是出问题时
        // 一眼看得见它是什么。
        let error = resolve("desktop.DesktopService", "StartService", MethodKind::Unary)
            .expect_err("StartService must never be reachable from the webview");
        assert!(matches!(error, CommandError::PermissionDenied(_)));
    }

    #[test]
    fn rejects_unknown_service_and_method_differently() {
        let unknown_service = resolve("desktop.NopeService", "Whatever", MethodKind::Unary)
            .expect_err("unknown service must not resolve");
        assert!(format!("{unknown_service}").contains("unknown daemon service"));

        let unknown_method = resolve("desktop.DesktopService", "Whatever", MethodKind::Unary)
            .expect_err("unknown method must not resolve");
        assert!(format!("{unknown_method}").contains("unknown daemon method"));
    }
}
