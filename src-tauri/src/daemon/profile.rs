// sing-box 的可分享 profile 格式（`.bpf`）—— 编码与解码。
//
// 和 `validate` 一样走 worker 自己的 `ApplicationService` 管道
// （`worker::application_channel`），所以服务没装、实例没跑也能用：分享一份
// 配置本来就不该要求先把代理跑起来。
//
// 格式本身是 libbox 的 `ProfileContent.Encode()`（上游
// `experimental/boxdd/application_service.go` 只是把它包了一层 RPC），也就是
// 官方各端之间互传配置用的那个二进制格式。fresh-box 不自己解析它 —— 编解码
// 交给 daemon，这边只管落盘和入库。

use crate::errors::CommandError;

use super::desktop_api::ProfileContent;
use super::desktop_api::application_service_client::ApplicationServiceClient;
use super::worker;

/// `ProfileContent.Type`。上游是 `LOCAL=0 / ICLOUD=1 / REMOTE=2`；fresh-box
/// 只会产出前者和后者（iCloud 是 Apple 平台的事）。
pub const TYPE_LOCAL: i32 = 0;
pub const TYPE_REMOTE: i32 = 2;

/// 把一份配置打包成可分享的字节。
pub async fn encode(content: ProfileContent) -> Result<Vec<u8>, CommandError> {
    ApplicationServiceClient::new(worker::application_channel().await?)
        .encode_profile(content)
        .await
        .map(|response| response.into_inner().data)
        .map_err(|status| CommandError::validation(status.message().to_string()))
}

/// 反过来。内容非法时错误里带的是 daemon 自己的话术，和 `check_config` 一样。
pub async fn decode(data: Vec<u8>) -> Result<ProfileContent, CommandError> {
    ApplicationServiceClient::new(worker::application_channel().await?)
        .decode_profile(super::desktop_api::ProfileData { data })
        .await
        .map(|response| response.into_inner())
        .map_err(|status| CommandError::validation(status.message().to_string()))
}
