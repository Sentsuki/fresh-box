import { createClient } from "@connectrpc/connect";
import type { Client } from "@connectrpc/connect";

import {
  ApplicationService,
  DesktopService,
} from "../gen/boxdd/desktop_service_pb";
import { ManagedService } from "../gen/daemon/managed_service_pb";
import { StartedService } from "../gen/daemon/started_service_pb";
import { createTauriTransport } from "./transport";

/**
 * daemon 域的全部入口。
 *
 * 每个 stub 的方法、参数、返回值都是从 `src-tauri/proto` 生成的 —— 字段名
 * 拼错、类型用错都是编译错误，不再需要 `check-commands.mjs` 那种事后校验，
 * 也不再有 `types/app.ts` 里那份手抄的镜像。
 *
 * 注意这些 stub 只是「能调什么」，不代表「现在能调通」：连接是否可用由
 * `DaemonSession` 的 reconciliation loop 决定，调用失败时抛 `ConnectError`。
 * 阶段 5 的 `<DaemonGate>` 会把「连接不可用」和「这次调用失败」在 UI 上
 * 彻底分开。
 */
const transport = createTauriTransport();

export const desktopService: Client<typeof DesktopService> = createClient(
  DesktopService,
  transport,
);

/**
 * worker 自己管道上的服务 —— 和特权 daemon 服务装没装、跑没跑无关。
 *
 * 这是它和上面几个的关键区别：`DesktopService`/`ManagedService`/
 * `StartedService` 都要先连上 daemon（甚至要先有跑着的实例），而
 * `ApplicationService` 由 worker 无条件注册（`cmd_worker.go`）。所以配置校验、
 * 格式化、profile 编解码、离线连通性测试在「什么都没启动」时照样能用。
 * Rust 侧按 service 名把这几条 RPC 路由到 worker 管道，见
 * `commands::bridge::channel_for`。
 *
 * `formatConfig` 目前没有调用点，是有意的：它把配置解析成完整的 sing-box
 * `Options` 再重新编码（上游 `daemon/instance.go`），对 Advanced 页那份
 * **部分**覆盖层用是错的 —— 会把没写的字段补齐、把不认识的丢掉。等真有了
 * 完整配置的编辑器再接。
 */
export const applicationService: Client<typeof ApplicationService> =
  createClient(ApplicationService, transport);

export const managedService: Client<typeof ManagedService> = createClient(
  ManagedService,
  transport,
);

export const startedService: Client<typeof StartedService> = createClient(
  StartedService,
  transport,
);
