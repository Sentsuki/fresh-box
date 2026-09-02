fn main() {
    // Generate the gRPC client stubs for talking to `sing-box-daemon.exe`
    // (see proto/ — vendored + trimmed from sing-box's `daemon` and
    // `experimental/boxdd` packages). Uses a vendored `protoc` binary so
    // contributors don't need one on PATH.
    // SAFETY: build.rs runs single-threaded before any other code, so
    // mutating the process environment here is not racing anything.
    unsafe {
        std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    }
    tonic_prost_build::configure()
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
