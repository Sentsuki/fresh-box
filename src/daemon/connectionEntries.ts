import {
  ConnectionEventType,
  type Connection,
  type ConnectionEvent,
} from "../gen/daemon/started_service_pb";
import type { ConnectionEntry } from "../types/app";

/**
 * 连接事件 → 表格条目，纯数据变换。
 *
 * 单独成文件是为了能测：`connectionsStream.ts` 顶层就要建订阅，一路拉进
 * store、Fluent UI 和 Tauri IPC；这里只依赖生成的 protobuf 类型，`import`
 * 它没有任何副作用。
 *
 * 顺带修掉的（都不是「修」，是不再存在）：
 *   L-17  CLOSED 事件带的最终统计和 `closedAt` 以前被 Rust 直接丢弃，
 *         「已关闭」标签页只能靠逐帧 diff 反推，显示的是最后一帧的活跃快照。
 *   类 A  `dnsMode`/`inboundPort`/`rulePayload` 这些 boxdd 根本没有的字段
 *         不再被硬造成空值塞进来 —— 它们从类型里消失了。
 */

export function splitHostPort(address: string): [string, string] {
  // 带方括号的 IPv6（`[::1]:80`）和普通 `host:port`。
  if (address.startsWith("[")) {
    const end = address.indexOf("]");
    if (end !== -1) {
      return [address.slice(1, end), address.slice(end + 1).replace(/^:/, "")];
    }
  }
  const colon = address.lastIndexOf(":");
  if (colon === -1) return [address, ""];
  return [address.slice(0, colon), address.slice(colon + 1)];
}

function processName(path: string): string | undefined {
  if (!path) return undefined;
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || undefined;
}

/** Unix 毫秒 → 本地化时间串，给表格用。 */
function formatTimestamp(millis: bigint): string {
  const value = Number(millis);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toISOString();
}

function toEntry(connection: Connection): ConnectionEntry {
  const [sourceIP, sourcePort] = splitHostPort(connection.source);
  const [destinationIP, destinationPort] = splitHostPort(connection.destination);
  const path = connection.processInfo?.processPath ?? "";

  return {
    id: connection.id,
    metadata: {
      network: connection.network,
      type: connection.inboundType,
      host: connection.domain || destinationIP,
      sourceIP,
      sourcePort,
      destinationIP,
      destinationPort,
      processPath: path || undefined,
      process: processName(path),
      remoteDestination: connection.destination,
      sniffHost: connection.domain,
      inboundUser: connection.user,
      inboundName: connection.inbound,
    },
    upload: Number(connection.uplinkTotal),
    download: Number(connection.downlinkTotal),
    start: formatTimestamp(connection.createdAt),
    chains: connection.chainList,
    rule: connection.rule,
    uploadSpeed: 0,
    downloadSpeed: 0,
  };
}

/**
 * 把一条事件应用到累加表上。
 *
 * UPDATE 事件**不带** `connection` 载荷 —— 上游 `buildTrafficUpdates` 只在
 * NEW 时填它，UPDATE 分支只带 `uplinkDelta`/`downlinkDelta`。原来的 Rust 实现
 * 一度因为「没有 connection 就 return」而把每一条增量都丢掉，导致速度恒为 0；
 * 那个 bug 的修法（就地累加）在这里保留下来，并且现在是唯一一份实现。
 */
export function applyEvent(
  active: Map<string, ConnectionEntry>,
  closed: ConnectionEntry[],
  event: ConnectionEvent,
): void {
  if (event.type === ConnectionEventType.CONNECTION_EVENT_CLOSED) {
    const previous = active.get(event.id);
    active.delete(event.id);
    // CLOSED 事件带着完整的 `Connection`（含最终累计和 `closedAt`），用它
    // 而不是最后一帧的活跃快照 —— 这正是以前丢掉的信息。
    if (event.connection) {
      const entry = toEntry(event.connection);
      closed.unshift({
        ...entry,
        closedAt: formatTimestamp(event.connection.closedAt),
      });
    } else if (previous) {
      closed.unshift({ ...previous, downloadSpeed: 0, uploadSpeed: 0 });
    }
    return;
  }

  if (event.connection) {
    // NEW：整条连接的初始快照。
    active.set(event.id, toEntry(event.connection));
    return;
  }

  // UPDATE：只有增量，就地累加到已有条目上。
  const existing = active.get(event.id);
  if (!existing) return;
  const down = event.downlinkDelta > 0n ? Number(event.downlinkDelta) : 0;
  const up = event.uplinkDelta > 0n ? Number(event.uplinkDelta) : 0;
  existing.download += down;
  existing.upload += up;
  existing.downloadSpeed = down;
  existing.uploadSpeed = up;
}
