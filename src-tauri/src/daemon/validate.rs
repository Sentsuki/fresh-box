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
use super::{pipe, worker};

/// Validate `content` as a sing-box configuration. On invalid input, the
/// returned error carries sing-box's own parser message (e.g. `"decode
/// config at index 0: outbound[0]: type is required"`) unmodified, so the
/// UI can show the user exactly what's wrong instead of a generic failure.
pub async fn check_config(content: &str) -> Result<(), CommandError> {
    let daemon_path = super::install::daemon_executable_path()?;
    if !daemon_path.exists() {
        return Err(CommandError::resource_not_found(
            "sing-box-daemon executable",
            daemon_path.display(),
        ));
    }

    let worker = worker::shared_worker().get(&daemon_path).await?;

    let channel = pipe::connect(worker.socket_path.clone())
        .await
        .map_err(|e| {
            CommandError::network(format!("connect to worker application service: {e}"))
        })?;

    ApplicationServiceClient::new(channel)
        .check_config(ConfigContent {
            content: content.to_string(),
        })
        .await
        .map(|_| ())
        .map_err(|status| CommandError::validation(status.message().to_string()))
}
