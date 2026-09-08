import { createClient } from "@connectrpc/connect";
import type { Client } from "@connectrpc/connect";

import { DesktopService } from "../gen/boxdd/desktop_service_pb";
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

export const managedService: Client<typeof ManagedService> = createClient(
  ManagedService,
  transport,
);

export const startedService: Client<typeof StartedService> = createClient(
  StartedService,
  transport,
);
