// Validates untrusted sing-box config content (subscription downloads,
// manually-saved subscription files) against the *real* sing-box config
// parser before fresh-box ever writes it to disk.
//
// Mirrors the official desktop client: `src/main/profiles.ts`'s
// `checkConfig()` calls `applicationService.checkConfig({ content })`
// before a fetched/edited profile is persisted or activated, and lets any
// `ConnectError` bubble up with the parser's own message. We do the same
// thing here, against the same RPC (`ApplicationService.CheckConfig`,
// vendored in `proto/boxdd/desktop_service.proto`), just reached over a
// named pipe instead of the daemon-relay's IPC.
//
// `ApplicationService` is registered on the *worker's own* `--socket` pipe
// (see `cmd_worker.go` upstream), not the relay pipe `DaemonClient` talks
// through — and it comes up as soon as the worker itself is ready,
// regardless of whether the privileged daemon service is installed or
// running (`startWorkerDaemonRelay` only starts listening for a relay
// connection; it doesn't block worker startup on one). So this dials the
// process-wide shared worker (`worker::shared_worker`) — spawning one on
// first use, same as `DaemonClient::connect` — rather than spinning up and
// tearing down a dedicated one for every single check.

use crate::errors::CommandError;

use super::desktop_api::ConfigContent;
use super::desktop_api::application_service_client::ApplicationServiceClient;
use super::worker;

/// Validate `content` as a sing-box configuration. On invalid input, the
/// returned error carries sing-box's own parser message (e.g. `"decode
/// config at index 0: outbound[0]: type is required"`) unmodified, so the
/// UI can show the user exactly what's wrong instead of a generic failure.
///
/// 「配置不合法」和「校验器没能跑起来」分开报（审计项 M-3）。以前任何
/// `tonic::Status` 都会变成 `ValidationError` —— worker 起不来、管道断了，
/// 用户看到的却是「你的配置有问题」。而且 `start_with_profile` 每次启动前都
/// 校验，所以这个误判还会顺带把启动挡住，并把人引向去改一份根本没错的配置。
///
/// 分界线是 gRPC 的 code：`InvalidArgument` / `Unknown` 来自处理器本身
/// （Go 侧 `return nil, err` 的普通 error 会被 grpc-go 包成 `Unknown`，
/// sing-box 的解析错误正是这么回来的），其余的（`Unavailable`、
/// `Unimplemented`、`DeadlineExceeded`、`Internal` …）是这条路没走通。
pub async fn check_config(content: &str) -> Result<(), CommandError> {
    ApplicationServiceClient::new(worker::application_channel().await?)
        .check_config(ConfigContent {
            content: content.to_string(),
        })
        .await
        .map(|_| ())
        .map_err(classify)
}

fn classify(status: tonic::Status) -> CommandError {
    use tonic::Code;
    match status.code() {
        Code::InvalidArgument | Code::Unknown => {
            // 解析器自己的话，原样交给用户 —— 它比我们能写的任何话术都准确。
            CommandError::validation(status.message().to_string())
        }
        code => CommandError::network(format!(
            "could not validate the configuration: {} ({code:?})",
            status.message()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tonic::{Code, Status};

    #[test]
    fn a_parser_rejection_is_a_validation_error() {
        // grpc-go 把处理器返回的普通 error 包成 `Unknown`，sing-box 的解析
        // 错误就是这么回来的 —— 消息要原样保留，UI 直接显示它。
        let error = classify(Status::new(
            Code::Unknown,
            "decode config at index 0: outbound[0]: type is required",
        ));
        assert!(matches!(error, CommandError::ValidationError(_)));
        assert!(format!("{error}").contains("outbound[0]: type is required"));
    }

    #[test]
    fn an_explicit_invalid_argument_is_also_a_validation_error() {
        let error = classify(Status::new(Code::InvalidArgument, "bad config"));
        assert!(matches!(error, CommandError::ValidationError(_)));
    }

    #[test]
    fn a_transport_failure_is_not_blamed_on_the_configuration() {
        // 审计项 M-3 的核心：worker 没起来不该说成「配置无效」。
        for code in [
            Code::Unavailable,
            Code::Unimplemented,
            Code::DeadlineExceeded,
            Code::Internal,
        ] {
            let error = classify(Status::new(code, "connection refused"));
            assert!(
                matches!(error, CommandError::NetworkError(_)),
                "{code:?} must not be reported as a configuration problem"
            );
            assert!(format!("{error}").contains("could not validate"));
        }
    }
}
