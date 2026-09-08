// bridge —— daemon 域的字节透传代理。
//
// 这是重构方案里「Rust 从翻译变成邮差」的那一层：整个 daemon 域（代理组、
// 连接、日志、流量、Clash 模式、测速、崩溃报告……）在 Rust 侧只剩下这一个
// 模块，而它一个 RPC 都不认识 —— 它只看信封上的地址（service/method），把
// 请求字节丢进管道，把响应字节丢回去。
//
// 于是：
//   * sing-box 加了新 RPC、改了字段 → Rust 一行不用动，它本来就不认识旧的
//   * 前端拿到的是 protobuf 生成的完整类型，不再有手写的 Clash 形状
//   * 那 8 个「Rust 发明数据」造成的缺陷（恒空字段、总量算错、CLOSED 事件
//     被丢弃……）不是被修好，是不再存在
//
// 模块划分：
//   codec.rs      `BytesCodec`，两端都是 `Bytes` 的 tonic Codec
//   allowlist.rs  由 build.rs 从 proto 生成的方法表 = bridge 的能力边界
//
// 阶段 0 只做一元调用。服务端流（`daemon_stream` + `StreamRegistry` + 按窗口
// 回收）是阶段 2 的内容 —— 见方案 08 节。

pub mod allowlist;
pub mod codec;

use tonic::client::Grpc;
use tonic::codegen::Bytes;

use crate::daemon::DaemonConnection;
use crate::errors::CommandError;

use allowlist::MethodKind;

/// 发一次一元 gRPC 调用，返回响应的原始 protobuf 字节。
///
/// `request` 是前端已经用 protobuf-es 编码好的字节，这里不解析、不校验、
/// 不改写 —— 唯一的检查是 `allowlist::resolve`：这条 service/method 是否
/// 存在、是否确实是一元的、是否允许暴露给 webview。
pub async fn unary(
    connection: &DaemonConnection,
    service: &str,
    method: &str,
    request: Vec<u8>,
) -> Result<Vec<u8>, CommandError> {
    let path = allowlist::resolve(service, method, MethodKind::Unary)?;

    let mut grpc = Grpc::new(connection.raw_channel());
    grpc.ready().await.map_err(|e| {
        CommandError::network(format!("daemon bridge channel not ready: {e}"))
    })?;

    let response = grpc
        .unary(
            tonic::Request::new(Bytes::from(request)),
            path,
            codec::BytesCodec,
        )
        .await
        .map_err(|status| {
            // 把 gRPC 的 code 一起带上：前端要靠它区分「daemon 说不行」和
            // 「连接断了」，光有 message 不够。
            CommandError::network(format!(
                "{service}/{method}: {} ({:?})",
                status.message(),
                status.code()
            ))
        })?;

    Ok(response.into_inner().to_vec())
}
