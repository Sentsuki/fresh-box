# vendored proto

`sing-box-daemon.exe`（boxdd）的 gRPC 接口，从 `sing-box-1.14.0` 手工裁剪而来：

| 这里的文件 | 上游 |
| --- | --- |
| `daemon/started_service.proto` | `daemon/started_service.proto` |
| `daemon/managed_service.proto` | `daemon/managed_service.proto` |
| `boxdd/desktop_service.proto` | `experimental/boxdd/desktop_service.proto` |

`build.rs` 拿它们做两件事：生成 tonic 客户端 stub（Rust 自己的常驻逻辑用），
以及生成 bridge 的方法表。前端的 protobuf-es stub 由 `buf generate` 从同一份
文件生成（见仓库根的 `buf.gen.yaml`）。

## 裁剪是有意的，而且它有两层

**第一层：vendor 了什么。** 没 vendor 进来的 RPC 在 fresh-box 里根本不存在
—— 没有 stub、没有方法表条目、Rust 和前端都调不到。下面列出裁掉了什么、为
什么。

**第二层：vendor 了但不给前端。** 进了方法表不等于 webview 能调，那由
`build.rs` 的 `EXPOSED` 白名单决定（目前 15 条）。`DesktopService` 和
`ManagedService` 整个不对前端开放，它们的能力走 host 域的命令。理由见
`EXPOSED` 自己的文档注释。

**这份文档存在的原因**：不写下来的话，下一个人看到 `SetSystemProxyEnabled`
不在这儿，只会以为 daemon 没这功能 —— 而它有。

## 裁掉了什么

### 整块功能，不在 fresh-box 的范围内

上游 `StartedService` 里这几组 RPC 一条都没 vendor：

- **Tailscale / Taildrop** —— `SubscribeTailscaleStatus`、`StartTailscalePing`、
  `SetTailscaleExitNode`、`TailscaleLogout`、`GetTailscaleCertificate`、
  `StartTailscaleSSHSession`、`SubscribeTaildropInbox`、`SendTaildropFiles`、
  `DownloadTaildropFile`、`DeleteTaildropFile`、`MarkTaildropInboxRead`、
  `CancelTaildropReceiving`，**以及 `SubscribeNotifications`**
- **USB/IP** —— `ProvideUSBDevices`、`SubscribeUSBIPServerStatus`
- **OpenConnect / OpenVPN 的交互式认证** —— `SubscribeOpenConnectStatus`、
  `SubmitOpenConnectAuthResponse`、`CancelOpenConnectAuthChallenge`、
  `SubscribeOpenVPNStatus`、`SubmitOpenVPNChallengeResponse`、
  `CancelOpenVPNChallenge`

这些各自都是一整块产品功能（文件收发、SSH 终端、设备共享、认证挑战 UI），
不是「顺手接一下」的量级。其中 `SendTaildropFiles` / `StartTailscaleSSHSession`
/ `ProvideUSBDevices` 还是**客户端流**，而 bridge 只支持一元和服务端流
（`build.rs` 的 `parse_proto` 对客户端流直接 panic）—— 要接得先扩 bridge。

`SubscribeNotifications` 跟着 Tailscale 一起列在这里，值得单独说一句，因为
光看名字会以为它是个通用能力。它推的是内核要求宿主弹的**系统通知**，带
`(typeID, identifier)` 身份、可撤销（`NotificationCancel`）、可点击
（`openURL`）—— 官方客户端的 `main/notifications.ts` 就是拿这三样做的：同键
重发替换旧的、收到 cancel 关掉、点击打开 URL。

但 1.14.0 里构造 `adapter.Notification{}` 的地方**只有两处**，都在 Tailscale
里：`protocol/tailscale/endpoint.go`（需要重新登录，`openURL` 是认证页）和
`protocol/tailscale/taildrop.go`（文件收发进展，`openURL` 是
`sing-box:taildrop?...` 深链）。Windows 上 `UsePlatformNotification()` 无条件
返回 `true`，管道是通的，但没有第三个生产者。所以对 fresh-box 而言这条流接上
也永远不会推来任何东西 —— 它是那一整块功能的投递通道，不是一个独立缺口。
真要接，得先有 Tailscale。

（fresh-box 自己那套「起了 / 停了 / 挂了」的系统通知是另一回事，由
`services::resident::spawn_notifier` 产生，和这条流没有重叠。）

### 有替代实现

- `ManagedService.ReloadService` —— 不需要：`DesktopService.StartService` 上游
  实际调的就是 `StartOrReloadService`，在同一把 lifecycle 锁下原子换配置。
  fresh-box 的「切配置 / 刷订阅后重载」全走它（`services::singbox::
  start_with_profile`）。
- `DesktopService.InstallUpdate` —— 应用自更新走 `tauri-plugin-updater`
  （签名 + GitHub release），不经过 daemon。
- `StartedService.GetVersion` —— 版本从 `DesktopService.GetDaemonInfo` 拿，
  reconciliation loop 每次握手本来就要调它（还要用它做版本一致性检查）。
- `StartedService.SubscribeOutbounds` —— 一份扁平的出站列表；代理页要的是
  分组结构，那是 `SubscribeGroups`。
- `StartedService.GetDefaultLogLevel` —— 日志级别由 priority config 决定并写进
  合成后的配置（`config::priority`），不问 daemon 要默认值。

### 有意不做

- `ManagedService.GetSystemProxyStatus` / `SetSystemProxyEnabled` ——
  **系统代理开关**。fresh-box 是 TUN-only 的：接管在网络层，不改 WinINET 的
  代理设置。加回来意味着要处理两种接管模式并存时的全部状态组合（谁优先、
  切换时怎么收尾、崩溃后谁负责还原系统设置），那是产品决定，不是接一个 RPC。
- `DesktopService.GetSecuritySettings` / `SetInsecureModeEnabled` ——
  insecure 模式关掉 TLS 校验。一个能从 UI 打开的「不验证证书」开关，代价
  远大于它的用处。
- `ManagedService.TriggerDebugCrash` / `TriggerOOMReport` —— 上游用来自测崩溃
  报告链路的调试入口。真要测就用 `sing-box-daemon.exe` 命令行。
- `DesktopService.SetLocale` —— 界面只有英文，没有 i18n 层；接了也无处可传。
  真要做多语言时，这条和前端的 i18n 一起加。
- `DesktopService.GenerateConfigSchema` —— 给完整配置编辑器做 schema 补全用的。
  Advanced 页只有一份**部分**覆盖层，没有完整编辑器。（同理
  `ApplicationService.FormatConfig` 虽然 vendor 了，但对部分覆盖层用是错的 ——
  见 `src/daemon/clients.ts` 的说明。）
- `DesktopService.ArchiveReport` —— 报告导出走
  `Export{Crash,OOM,Power}Report`，它们各自返回打好包的归档；`ArchiveReport`
  是另一条上游自己用的路径。

### 没做，但不是不该做

这一条是真的缺口，将来想补的话从这里开始：

- `StartedService.GetDeprecatedWarnings` —— 配置里用了已弃用字段时的告警。
  上游 `experimental/deprecated/constants.go` 里有十几条（`outbound-dns-rule-item`、
  `missing-domain-resolver`、`legacy-domain-strategy-options`、
  `legacy-rule-set-download-detour` …），每条都带 `DeprecatedVersion` /
  `ScheduledVersion` / `MigrationLink`。它专门打中「订阅提供方按老版本
  sing-box 写的配置」，而那正是 fresh-box 用户最常见的配置来源 —— 弃用往往是
  「现在还能跑，但下个大版本会断」，现在用户只有等它真的断了才知道。
  注意它要求实例已 `STARTED`（`started_service.go` 开头就查），所以它属于
  「跑起来之后提示一次」，不是导入时的静态检查。

## 加回一条

1. 从 `sing-box-1.14.0` 对应文件里把 `rpc` 那行（以及它用到的 message）抄进来，
   保持这里的一行一条格式 —— `build.rs` 的 `parse_proto` 是逐行扫的。
2. `pnpm gen:proto` 重新生成前端 stub。
3. 前端要直接调的话，在 `build.rs` 的 `EXPOSED` 里加一行；先读那份文档注释，
   有些能力更适合走 host 域的命令。
4. 顺手更新这份文档 —— 上面某一条从「裁掉了」变成「有了」。
