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
//   registry.rs   活跃流按窗口分组，窗口销毁时一并取消

pub mod allowlist;
pub mod codec;
pub mod registry;

use tonic::Streaming;
use tonic::client::Grpc;
use tonic::codegen::Bytes;

use tonic::transport::Channel;

use crate::errors::CommandError;

use allowlist::MethodKind;

/// 发一次一元 gRPC 调用，返回响应的原始 protobuf 字节。
///
/// `request` 是前端已经用 protobuf-es 编码好的字节，这里不解析、不校验、
/// 不改写 —— 唯一的检查是 `allowlist::resolve`：这条 service/method 是否
/// 存在、是否确实是一元的、是否允许暴露给 webview。
///
/// 通道由调用方选（见 `commands::bridge::channel_for`）：daemon relay 还是
/// worker 自己的管道，取决于这条 RPC 住在哪个服务上。
pub async fn unary(
    channel: Channel,
    service: &str,
    method: &str,
    request: Vec<u8>,
) -> Result<Vec<u8>, CommandError> {
    let path = allowlist::resolve(service, method, MethodKind::Unary)?;

    let mut grpc = Grpc::new(channel);
    grpc.ready()
        .await
        .map_err(|e| CommandError::network(format!("daemon bridge channel not ready: {e}")))?;

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

/// 流帧的一字节标签。
///
/// `Channel<InvokeResponseBody>` 只能送裸字节，没有地方放「这是消息 / 结束 /
/// 出错」这类控制信息，所以在载荷前面加一个字节。
///
/// 这不算「发明数据」：加的是传输分帧，protobuf 载荷本身一个字节都没动 ——
/// 前端剥掉标签拿到的就是 daemon 原样发出的那串字节。对照 gRPC 自己也在每条
/// 消息前加 5 字节的压缩标志+长度。
///
/// 前端的对应实现见 `src/daemon/transport.ts`，两边的常量必须一致。
pub mod frame {
    /// `0x00` + protobuf 载荷
    pub const MESSAGE: u8 = 0x00;
    /// `0x01`，无载荷 —— 流正常结束
    pub const END: u8 = 0x01;
    /// `0x02` + UTF-8 错误描述
    pub const ERROR: u8 = 0x02;

    pub fn message(payload: &[u8]) -> Vec<u8> {
        let mut framed = Vec::with_capacity(payload.len() + 1);
        framed.push(MESSAGE);
        framed.extend_from_slice(payload);
        framed
    }

    pub fn end() -> Vec<u8> {
        vec![END]
    }

    pub fn error(message: &str) -> Vec<u8> {
        let mut framed = Vec::with_capacity(message.len() + 1);
        framed.push(ERROR);
        framed.extend_from_slice(message.as_bytes());
        framed
    }
}

/// 建立一条服务端流，返回逐帧的原始字节。
///
/// 和 `unary` 一样：请求字节由前端编码好，响应字节原样交回，Rust 不解析。
pub async fn server_streaming(
    channel: Channel,
    service: &str,
    method: &str,
    request: Vec<u8>,
) -> Result<Streaming<Bytes>, CommandError> {
    let path = allowlist::resolve(service, method, MethodKind::ServerStreaming)?;

    let mut grpc = Grpc::new(channel);
    grpc.ready()
        .await
        .map_err(|e| CommandError::network(format!("daemon bridge channel not ready: {e}")))?;

    grpc.server_streaming(
        tonic::Request::new(Bytes::from(request)),
        path,
        codec::BytesCodec,
    )
    .await
    .map(|response| response.into_inner())
    .map_err(|status| {
        CommandError::network(format!(
            "{service}/{method}: {} ({:?})",
            status.message(),
            status.code()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::frame;

    // 分帧的两端必须逐字节一致 —— 前端那半在 `src/daemon/transport.test.ts`。
    // 标签值写死在断言里而不是引用常量：常量被改动时这里要红，那正是重点。

    #[test]
    fn a_message_frame_is_the_tag_then_the_payload_verbatim() {
        let payload = [0x00, 0xff, 0x08, 0x96];
        let framed = frame::message(&payload);
        assert_eq!(framed[0], 0x00);
        assert_eq!(&framed[1..], &payload);
    }

    #[test]
    fn an_empty_payload_still_produces_a_message_frame() {
        // 全字段默认值的 protobuf 消息编码后是零字节 —— 帧里只剩标签。
        assert_eq!(frame::message(&[]), vec![0x00]);
    }

    #[test]
    fn the_end_frame_carries_nothing() {
        assert_eq!(frame::end(), vec![0x01]);
    }

    #[test]
    fn an_error_frame_carries_utf8_text() {
        let framed = frame::error("instance stopped");
        assert_eq!(framed[0], 0x02);
        assert_eq!(
            std::str::from_utf8(&framed[1..]).expect("error text is utf-8"),
            "instance stopped"
        );
    }

    #[test]
    fn non_ascii_error_text_survives() {
        let framed = frame::error("实例已停止");
        assert_eq!(
            std::str::from_utf8(&framed[1..]).expect("error text is utf-8"),
            "实例已停止"
        );
    }
}
