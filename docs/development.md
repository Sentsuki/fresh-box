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
pnpm gen            # = gen:proto + gen:host，两条 codegen 一起跑
pnpm gen:proto      # daemon 域：从 src-tauri/proto 生成 TS 类型（buf）
pnpm gen:host       # host 域：从 Rust 生成命令与类型（tauri-specta）
pnpm build          # tsc + vite（prebuild 会校验 IPC 命令名两侧一致）
pnpm lint:check     # eslint，零 warning
pnpm test           # 前端单测（vitest），不需要 daemon 也不需要浏览器
cargo test          # 含 bridge codec/allowlist、配置合成、SQLite 单测
cargo test --test bridge_e2e -- --nocapture     # bridge 端到端，需要上面那个 daemon
cargo test --test resident_e2e -- --nocapture   # 常驻订阅，同上
cargo test --test store_e2e                     # SQLite 验收，不需要 daemon
```

带 `_e2e` 的测试在没有开发 daemon 时会**跳过而不是失败**（各花约 0.3 秒做 TCP
探活）。想确认它们真的跑了，看耗时：跳过约 0.3 秒，真跑起来会明显更久。

### 前端单测测什么

`pnpm test` 跑在 node 上，不起 jsdom、不碰 Tauri：

| 文件 | 测的东西 |
|---|---|
| `src/daemon/transport.test.ts` | 流分帧（消息/结束/出错标签）、取消回收流 id、错误包成 `ConnectError` |
| `src/daemon/subscription.test.ts` | 「流结束 ≠ 出错」那条状态机分支、退避重订阅 |
| `src/daemon/connectionEntries.test.ts` | 连接事件累加（NEW/UPDATE/CLOSED）、`host:port` 拆分 |
| `src/daemon/proxyOverview.test.ts` | `Group` → 代理页视图模型，即翻译层的替代品 |
| `src/hooks/logFormat.test.ts` | ANSI 转义剥离、日志分类提取 |
| `src/types/app.test.ts` | 设置归一化对坏数据的态度 |

为了能这么测，几个纯函数从「顶层就建订阅」的模块里拆了出来
（`connectionEntries.ts`、`proxyOverview.ts`、`logFormat.ts`）——
`import` 它们没有任何副作用。组件本身不测：相位表那类穷举由类型保证
（`Record<DaemonPhaseName, …>`，见 `DaemonGate`），`tsc` 已经在管了。

## 两条 codegen

跨 IPC 的类型没有一处是手写的：

| 域 | 来源 | 产物 | 命令 |
|---|---|---|---|
| daemon | `src-tauri/proto/*.proto` | `src/gen/daemon/`、`src/gen/boxdd/` | `pnpm gen:proto` |
| host | Rust 的 `#[tauri::command]` + `#[derive(specta::Type)]` | `src/gen/host.ts` | `pnpm gen:host` |

`src/gen/` 是生成产物，不入库。**首次 clone 后必须跑一次 `pnpm gen`**，否则
类型检查过不了。

host 域的导出走应用自己的一个开关（`fresh-box.exe --export-bindings <path>`）
而不是 `cargo test`：`collect_commands!` 会把整个 wry 运行时链进调用它的二进制，
集成测试的测试二进制这么一链，启动时就 `STATUS_ENTRYPOINT_NOT_FOUND`（缺的
不是 WebView2Loader，试过了）。应用自身带着能正常加载的那套依赖。

`tauri-specta` 锁死在 `=2.0.0-rc.25`：这条线目前只有 release candidate，不锁的
话一次 `cargo update` 就可能把 IPC 边界换掉。

`scripts/check-commands.mjs` 现在只守 daemon bridge 那三个手写调用 —— 其余
47 个命令的漂移已经是编译错误。

## 数据存放位置

```
%LOCALAPPDATA%resh-box  fresh-box.db          SQLite（WAL）：profiles / settings / meta
  profiles\<uuid>.json  配置内容，文件名与显示名彻底解耦
  log\  crash_reports```

阶段 4 起不再有 `profile_index.json` / `app_settings.json` /
`backend_prefs.json` / `priority_config.json` / `config_override.json` /
`window_state.json`。**不做迁移**：场景是全新安装。磁盘上若有旧布局残留，
不读也不删。

想从头来过就把 `fresh-box.db` 和 `profiles\` 删掉，下次启动会建一个空库。

## 停掉开发 daemon 时别误伤安装版服务

安装版服务的进程名同样是 `sing-box-daemon.exe`，所以**不要**用
`taskkill /IM sing-box-daemon.exe` —— 那会连同用户正在用的服务一起杀掉
（它有恢复动作会自己起来，但代理会断几秒）。按命令行认人：

```powershell
Get-CimInstance Win32_Process -Filter "Name='sing-box-daemon.exe'" |
  Where-Object { $_.CommandLine -like '*--listen 127.0.0.1:19090*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

只有开发实例带 `--listen`，安装版服务和它派生的 worker 都不带。

## 验证流是否泄漏

销毁模式（关窗 = 销毁 webview）下每次开关窗口都会新建一批订阅，漏收就会在
daemon 那边越攒越多。回收有两道保险（`WindowEvent::Destroyed` + `Channel::send`
失败自取消，见 `daemon::bridge::registry`），机制部分由
`cargo test daemon::bridge::registry` 覆盖。

端到端那半要看日志：每关一次窗口会打一行

```
cancelled daemon streams owned by a destroyed window  label=main cancelled=3 remaining=0
```

`remaining` 是全进程活跃流数。反复开关窗口，它必须回到同一个基线（只开一个
窗口时是 0）。这行是 `info` 级别，默认就会出现在 `%LOCALAPPDATA%resh-box\log\`
下的日志里，不用开 `RUST_LOG=debug`。
