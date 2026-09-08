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
