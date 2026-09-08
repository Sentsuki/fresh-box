# 本地开发

## 为什么 dev 构建连不上 daemon

boxdd 的对端认证要求 worker 的**父进程**是安装目录里那个 `sing-box.exe`，
且与 `sing-box-daemon.exe` 带同一张 Authenticode 证书（`peer_windows.go`
的 `serverHandshake`）。`pnpm tauri dev` 产出的可执行文件在 `target/debug/`
且未签名，永远不满足这条链——所以开发构建默认是连不上守护进程的，
所有 daemon 相关功能都会停在 `unavailable` 相位。

boxdd 自带了出口：`sing-box-daemon run --listen <addr>` 走 TCP 并**整个关掉
对端认证**（`peer_windows.go:55`；`server.go` 会打印 “development only,
no access control”）。`FRESH_BOX_DAEMON_ADDR` 就是对接它的。

## 起一个开发用 daemon

```powershell
# 任意可写目录即可，不需要管理员
$wd = "$env:TEMP\sing-box-daemon-dev"
mkdir $wd -Force
.\src-tauri\resources\daemon\sing-box-daemon.exe run `
  --listen 127.0.0.1:19090 `
  --working-directory $wd
```

然后：

```powershell
$env:FRESH_BOX_DAEMON_ADDR = "127.0.0.1:19090"
pnpm tauri dev
```

`DaemonClient::connect` 会直接拨这个地址，跳过 worker 那一跳；reconciliation
loop 也会跳过只在产品布局下才有意义的检查（服务是否注册、bundled exe 是否
存在、版本一致性、所有权）。

**这段代码只存在于 debug 构建**——开关读取被 `#[cfg(debug_assertions)]` 包着，
release 构建里没有任何读这个环境变量的代码，而不只是运行时忽略它。

## 开发模式下能用什么、不能用什么

| | 开发直连 (TCP) | 产品安装 |
|---|---|---|
| `StartedService`（代理组、连接、日志、流量、模式、测速） | ✅ 全部可用 | ✅ |
| `DesktopService`（`GetDaemonInfo`、`ClaimService`、`StartService`、崩溃/OOM/电源报告） | ❌ 全部不可用 | ✅ |

原因：`DesktopService` 的每个方法开头都调 `peerIdentityFromContext`
（`desktop_service.go` 里 10 处），而 `--listen` 只是不装传输层凭据，并没有
伪造出一个 peer identity——Windows 上会落到
`platformFallbackPeerIdentity`，直接返回 `missing Windows peer authentication`。
`StartedService` 一处都不需要（`started_service.go` 里 0 处），所以整个可用。

实际影响很小：重构里工作量最大的部分（流、代理组、连接、测速）全在
`StartedService`。需要真正验证 `DesktopService` 的时候，就得走一次签名安装。

因为启动实例本身要走 `DesktopService.StartService`，开发模式下没有跑着的
sing-box 实例，所以那些带 `waitForStarted` 的方法（如 `SubscribeGroups`）也
会失败。`GetStartedAt` 与 `SubscribeServiceStatus` 没有这个前置条件。

## 相关命令

```powershell
pnpm gen:proto      # 从 src-tauri/proto 生成 src/gen 下的 TS 类型（buf）
pnpm build          # tsc + vite（prebuild 会校验 IPC 命令名两侧一致）
cargo test          # 含 bridge allowlist 单测
cargo test --test bridge_e2e -- --nocapture   # 端到端，需要上面那个 daemon
```

`src/gen/` 是生成产物，不入库。首次 clone 后需要跑一次 `pnpm gen:proto`
才能通过类型检查。
