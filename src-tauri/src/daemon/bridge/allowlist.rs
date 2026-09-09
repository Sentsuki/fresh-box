// bridge 的能力边界 —— 前端能调到哪些 daemon RPC，全在这张表里。
//
// 表由 `build.rs` 从 `proto/` 下的 `.proto` 扫描生成（见那里的
// `generate_method_table`），所以它永远和 vendored proto 一致，不存在手工
// 维护漂移的问题：加一个能力必须先改 `.proto`。
//
// 官方客户端的 `bridge.ts` 是「4 个服务上的任意方法都放行」；fresh-box 这里
// 更紧一档 —— 除了服务/方法必须存在，`exposed: false` 的还会被单独挡掉
// （目前只有 `DesktopService.StartService`，理由见 build.rs 的 `NOT_EXPOSED`）。

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
            "'{service}/{method}' is deliberately not exposed over the daemon bridge"
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
        let path = resolve("desktop.DesktopService", "GetDaemonInfo", MethodKind::Unary)
            .expect("GetDaemonInfo is a unary method on DesktopService");
        assert_eq!(path.path(), "/desktop.DesktopService/GetDaemonInfo");
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
        // 这条测试守的是一条安全线，不是一个实现细节 —— 见 build.rs 的
        // `NOT_EXPOSED`。它变红说明有人（或某次 proto 更新）把配置内容的
        // 入口重新开给了 webview。
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
