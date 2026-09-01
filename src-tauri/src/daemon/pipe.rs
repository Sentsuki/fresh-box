// Windows named-pipe transport for tonic. tonic's built-in transport only
// dials TCP/TLS/Unix sockets, so gRPC calls to the worker's local pipe need
// a hand-rolled `tower` connector — this is that connector.
#![cfg(windows)]

use std::time::Duration;

use hyper_util::rt::TokioIo;
use tokio::net::windows::named_pipe::ClientOptions;
use tonic::transport::{Channel, Endpoint, Uri};
use tower::service_fn;

/// ERROR_PIPE_BUSY: every listener instance is currently servicing another
/// client. The pipe exists but isn't ready to accept us yet — retry rather
/// than failing outright, same as `CreateFile` callers are expected to via
/// `WaitNamedPipe` (we just poll instead of calling that Win32 API from
/// Rust).
const ERROR_PIPE_BUSY: i32 = 231;

/// Dial the worker's own named pipe (`--socket <pipe_path>` in
/// `worker.rs`) and return a ready-to-use gRPC channel. `pipe_path` is a
/// full path like `\\.\pipe\sing-box-worker.<id>`.
pub async fn connect(pipe_path: String) -> Result<Channel, tonic::transport::Error> {
    // The endpoint URI is never actually dialed — our connector ignores it
    // and always opens `pipe_path` — but `Endpoint` requires a well-formed
    // one to construct.
    Endpoint::try_from("http://sing-box-worker.local")
        .expect("static placeholder URI is valid")
        .connect_with_connector(service_fn(move |_uri: Uri| {
            let pipe_path = pipe_path.clone();
            async move {
                loop {
                    match ClientOptions::new().open(&pipe_path) {
                        Ok(client) => return Ok(TokioIo::new(client)),
                        Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                            tokio::time::sleep(Duration::from_millis(20)).await;
                        }
                        Err(e) => return Err(e),
                    }
                }
            }
        }))
        .await
}
