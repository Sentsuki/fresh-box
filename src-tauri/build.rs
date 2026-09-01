fn main() {
    // Generate the gRPC client stubs for talking to `sing-box-daemon.exe`
    // (see proto/ — vendored + trimmed from sing-box's `daemon` and
    // `experimental/boxdd` packages). Requires a `protoc` on PATH; if that's
    // ever a problem for contributors, switch to the `protobuf-src` crate to
    // vendor one instead of relying on the system copy.
    tonic_build::configure()
        .build_server(false)
        .compile_protos(
            &[
                "proto/daemon/managed_service.proto",
                "proto/daemon/started_service.proto",
                "proto/boxdd/desktop_service.proto",
            ],
            &["proto"],
        )
        .expect("failed to compile sing-box-daemon gRPC protos");

    tauri_build::build()
}
