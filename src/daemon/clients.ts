import { createClient } from "@connectrpc/connect";
import type { Client } from "@connectrpc/connect";

import { ApplicationService } from "../gen/boxdd/desktop_service_pb";
import { StartedService } from "../gen/daemon/started_service_pb";
import { createTauriTransport } from "./transport";

/**
 * daemon 域的全部入口 —— 前端能直接调到的 service 只有这两个。
 *
 * 每个 stub 的方法、参数、返回值都是从 `src-tauri/proto` 生成的 —— 字段名
 * 拼错、类型用错都是编译错误，不再需要 `check-commands.mjs` 那种事后校验，
 * 也不再有 `types/app.ts` 里那份手抄的镜像。
 *
 * 注意这些 stub 只是「能调什么」，不代表「现在能调通」：连接是否可用由
 * reconciliation loop 决定，调用失败时抛 `ConnectError`，`<DaemonGate>` 把
 * 「连接不可用」和「这次调用失败」在 UI 上彻底分开。
 *
 * ## 为什么没有 `DesktopService` / `ManagedService`
 *
 * 它们一条方法都不通过 bridge 暴露（见 `src-tauri/build.rs` 的 `EXPOSED`），
 * 所以这里也不建 stub —— 否则前端看起来能调，写下去拿到的是运行期
 * `PermissionDenied` 而不是编译错误。这两个 service 的能力（销毁工作目录、
 * 接管 daemon、导出/删除崩溃报告、停止实例）都由 host 域的命令提供，那里
 * 有守卫和人话错误，走 `services/api.ts`。
 */
const transport = createTauriTransport();

export const startedService: Client<typeof StartedService> = createClient(
  StartedService,
  transport,
);

/**
 * worker 自己管道上的服务 —— 和特权 daemon 服务装没装、跑没跑无关。
 *
 * 这是它和 `StartedService` 的关键区别：后者要先连上 daemon、甚至要先有跑着
 * 的实例，而 `ApplicationService` 由 worker 无条件注册（`cmd_worker.go`）。
 * 所以离线连通性测试在「什么都没启动」时照样能用 —— 那正是它存在的意义。
 * Rust 侧按 service 名把它路由到 worker 管道，见
 * `commands::bridge::channel_for`。
 *
 * 生成的 stub 带着这个 service 的全部 6 个方法，但 bridge 只放行其中两个
 * （`StartStandalone*Test`）—— protobuf-es 没法只生成半个 client，所以这层
 * 对不齐消不掉。另外四个是 **Rust 自己的**，不该从这里调：
 *
 *   `checkConfig`    每次导入/抓订阅/启动前的校验，`daemon::validate`
 *   `encodeProfile`  `.bpf` 导出，`daemon::profile`
 *   `decodeProfile`  `.bpf` 导入，同上
 *   `formatConfig`   没有调用点，而且对 Advanced 页那份**部分**覆盖层用是错的
 *                    —— 它会把配置解析成完整的 sing-box `Options` 再重新编码
 *                    （上游 `daemon/instance.go`），把没写的字段补齐、把不认识
 *                    的丢掉。等真有了完整配置的编辑器再说。
 *
 * 从前端调这四个会得到 `PermissionDenied`，错误里写着该去哪儿加。
 */
export const applicationService: Client<typeof ApplicationService> =
  createClient(ApplicationService, transport);
