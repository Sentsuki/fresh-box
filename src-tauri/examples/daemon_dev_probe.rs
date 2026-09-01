// Throwaway smoke test — NOT part of the shipped app.
//
// Talks to `sing-box-daemon.exe run --listen 127.0.0.1:<port>` over plain
// TCP instead of the production Windows named pipe. That dev mode
// (`experimental/boxdd/server.go`: `listenAddress != ""`) skips the
// Authenticode peer-authentication chain entirely, so this only proves the
// proto definitions we vendored actually match the compiled daemon's wire
// format and that our generated client stubs decode its responses — it does
// **not** exercise `daemon::pipe`, `daemon::worker`, or the signing-based
// auth path.
//
// Usage: run the daemon first, then this example against the same port:
//   ./boxdd/sing-box-daemon.exe run --listen 127.0.0.1:9911
//   cargo run --example daemon_dev_probe -- 127.0.0.1:9911

use fresh_box_lib::daemon::daemon_api::started_service_client::StartedServiceClient;
use fresh_box_lib::daemon::desktop_api::desktop_service_client::DesktopServiceClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:9911".to_string());
    let endpoint = format!("http://{addr}");
    println!("connecting to {endpoint} ...");

    let channel = tonic::transport::Endpoint::from_shared(endpoint)?
        .connect()
        .await?;
    println!("connected.");

    let mut desktop = DesktopServiceClient::new(channel.clone());
    let info = desktop
        .get_daemon_info(tonic::Request::new(()))
        .await?
        .into_inner();
    println!("GetDaemonInfo -> {info:#?}");

    let claim = desktop.claim_service(tonic::Request::new(())).await;
    println!("ClaimService -> {claim:?}");

    let mut started = StartedServiceClient::new(channel);
    let version = started
        .get_version(tonic::Request::new(()))
        .await?
        .into_inner();
    println!("GetVersion -> {version:#?}");

    Ok(())
}
