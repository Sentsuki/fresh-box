// 字节透传 codec —— 整个 bridge 的核心技巧，写一次永不再改。
//
// tonic 的 `Grpc::unary` / `server_streaming` 并不要求 `tonic-build` 生成的
// stub：它们接受一个 `PathAndQuery`（即 `/daemon.StartedService/URLTest`）和
// 一个调用方自己提供的 `Codec`。`ProstCodec` 在这里做的是「字节 ⇄ 具体的
// prost 消息类型」的转换 —— 而 fresh-box 的 bridge 恰恰不想要这层转换：请求
// 的字节由前端用 protobuf-es 编码好，响应的字节原样交回前端解码，Rust 全程
// 不需要知道这条 RPC 传的是 `Groups` 还是 `Log`。
//
// 所以这里实现的 `Codec` 两端都是 `Bytes`，encode 就是把字节倒进缓冲区，
// decode 就是把缓冲区里的字节全部取走。gRPC 的分帧（5 字节头 + 长度）由
// tonic 自己处理，`decode` 拿到的 `DecodeBuf` 已经正好是一条完整消息的
// 载荷，所以「全部取走」就是正确的语义 —— 参见 tonic `Decoder::decode` 的
// 文档：“The buffer will contain exactly the bytes of a full message.”
//
// 对照实现：`tonic-prost-0.14.6/src/codec.rs` 的 `ProstCodec`。

use tonic::Status;
use tonic::codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder};
// `Bytes` 走 tonic 自己的重导出，`Buf`/`BufMut` 走 prost 的 —— 都是为了不往
// Cargo.toml 里加 `bytes` 直接依赖（版本还得手动跟 tonic 对齐）。
use prost::bytes::{Buf, BufMut};
use tonic::codegen::Bytes;

#[derive(Debug, Clone, Copy, Default)]
pub struct BytesCodec;

impl Codec for BytesCodec {
    type Encode = Bytes;
    type Decode = Bytes;

    type Encoder = BytesEncoder;
    type Decoder = BytesDecoder;

    fn encoder(&mut self) -> Self::Encoder {
        BytesEncoder
    }

    fn decoder(&mut self) -> Self::Decoder {
        BytesDecoder
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct BytesEncoder;

impl Encoder for BytesEncoder {
    type Item = Bytes;
    type Error = Status;

    fn encode(&mut self, item: Self::Item, dst: &mut EncodeBuf<'_>) -> Result<(), Self::Error> {
        // `BufMut::put` 在容量不足时会 panic，而 `EncodeBuf` 的自动扩容受
        // `buffer_settings()` 控制 —— 先显式 reserve 一次，让「请求体比默认
        // 缓冲区大」这种情况走扩容而不是 panic。
        dst.reserve(item.len());
        dst.put(item);
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct BytesDecoder;

impl Decoder for BytesDecoder {
    type Item = Bytes;
    type Error = Status;

    fn decode(&mut self, src: &mut DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        // 空载荷（例如 `google.protobuf.Empty` 的响应）是合法的，会得到一个
        // 长度为 0 的 `Bytes` —— 不能在这里返回 `None`，那在 tonic 里表示
        // 「这一帧还没收全」，会让调用方一直等下去。
        let len = src.remaining();
        Ok(Some(src.copy_to_bytes(len)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream;
    use tonic::codec::{EncodeBody, Streaming};

    /// 走一趟真正的 gRPC 分帧：`EncodeBody` 把消息编成带 5 字节头的 HTTP body，
    /// `Streaming` 再把它读回来。这比直接调 `encode`/`decode` 有意义得多 ——
    /// `EncodeBuf`/`DecodeBuf` 的构造函数是 `pub(crate)`，而且手工造 buffer 恰好
    /// 绕开了这里唯一会出错的东西：`decode` 与 tonic 分帧逻辑的交互。
    async fn round_trip(messages: Vec<Bytes>) -> Vec<Bytes> {
        let source = stream::iter(messages.into_iter().map(Ok::<_, Status>));
        let body = EncodeBody::new_client(BytesEncoder, source, None, None);
        let mut decoded: Streaming<Bytes> = Streaming::new_request(BytesDecoder, body, None, None);

        let mut out = Vec::new();
        while let Some(message) = decoded.message().await.expect("decode must not fail") {
            out.push(message);
        }
        out
    }

    #[tokio::test]
    async fn bytes_survive_the_round_trip_unchanged() {
        // 非 UTF-8、含 0 字节 —— protobuf 载荷就长这样。
        let payload = Bytes::from_static(&[0x00, 0xff, 0x08, 0x96, 0x01, 0x00, 0x7f]);
        assert_eq!(round_trip(vec![payload.clone()]).await, vec![payload]);
    }

    #[tokio::test]
    async fn an_empty_message_decodes_as_an_empty_message_not_as_end_of_stream() {
        // 这是这个文件里唯一真正危险的地方：`decode` 若对零长载荷返回 `None`，
        // tonic 会理解成「这一帧还没收全」而永久等待。所有字段都取默认值的
        // protobuf 消息（`google.protobuf.Empty`、`StopRequest{}` …）编码后就是
        // 零字节，所以这条路径在真实使用中天天走到。
        let decoded = round_trip(vec![Bytes::new()]).await;
        assert_eq!(decoded.len(), 1, "one message in, one message out");
        assert!(decoded[0].is_empty());
    }

    #[tokio::test]
    async fn message_boundaries_are_preserved_across_a_stream() {
        // 服务端流（`SubscribeGroups` 等）逐条投递，前端按条解码 —— 三条消息
        // 不能被并成一条，哪怕中间那条是空的。
        let messages = vec![
            Bytes::from_static(b"first"),
            Bytes::new(),
            Bytes::from_static(b"third"),
        ];
        assert_eq!(round_trip(messages.clone()).await, messages);
    }

    #[tokio::test]
    async fn a_message_larger_than_the_default_encode_buffer_still_encodes() {
        // `EncodeBuf` 的默认容量是 8 KiB，而 `BufMut::put` 在容量不足时 panic ——
        // `encode` 里那次显式 `reserve` 就是为这个。订阅一份大配置的
        // `Groups` 快照轻松超过 8 KiB。
        let big = Bytes::from(vec![0xa5u8; 128 * 1024]);
        assert_eq!(round_trip(vec![big.clone()]).await, vec![big]);
    }
}
