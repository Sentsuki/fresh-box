import {
  ConnectionEventType,
  type Connection,
  type ConnectionEvent,
} from "../gen/daemon/started_service_pb";
import type { ConnectionEntry } from "../types/app";
import { useConnectionsStore } from "../hooks/useConnectionsStream";
import { startedService } from "./clients";
import { createStreamController } from "./subscription";

/**
 * 连接流 —— 事件累加从 Rust 搬到了前端。
 *
 * 为什么这样反而更轻：daemon 每秒只送**增量**（`buildTrafficUpdates` 只为
 * 新建的、有流量的、刚停止流量的连接生成事件），而原来的 Rust 实现每秒把
 * **全部**连接打包成 JSON 发过来（`streams.rs` 的 `build_frame`）——2000 条
 * 连接约 1 MB，前端还要在主线程上 `JSON.parse` 它。现在过界的是那几十条增量，
 * 累加是几十次 Map 操作，微秒级。
 *
 * 顺带修掉的（都不是「修」，是不再存在）：
 *   L-17  CLOSED 事件带的最终统计和 `closedAt` 以前被 Rust 直接丢弃，
 *         「已关闭」标签页只能靠逐帧 diff 反推，显示的是最后一帧的活跃快照。
 *   类 A  `dnsMode`/`inboundPort`/`rulePayload` 这些 boxdd 根本没有的字段
 *         不再被硬造成空值塞进来 —— 它们从类型里消失了。
 */

/**
 * `SubscribeConnectionsRequest.interval` 同样是 Go 的 `time.Duration`，
 * 单位纳秒 —— 和 `statusStream.ts` 里的 `STATUS_INTERVAL_NANOS` 同理。
 */
const CONNECTIONS_INTERVAL_NANOS = 1_000n * 1_000_000n;

function splitHostPort(address: string): [string, string] {
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
function applyEvent(
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

const MAX_CLOSED = 1000;

const controller = createStreamController({
  subscribe: (signal) =>
    startedService.subscribeConnections(
      { interval: CONNECTIONS_INTERVAL_NANOS },
      { signal },
    ),
  onMessage: (frame) => {
    const store = useConnectionsStore.getState();
    if (store.isPaused) return;

    // 累加表就是 store 里那份 —— 直接改再整体 set，避免每条事件触发一次渲染。
    const active = new Map(store.active.map((entry) => [entry.id, entry]));
    const closed = store.closed.slice();

    if (frame.reset) {
      active.clear();
    }
    for (const event of frame.events) {
      applyEvent(active, closed, event);
    }

    const entries = [...active.values()];
    store.setFrame({
      connections: entries,
      closed: closed.slice(0, MAX_CLOSED),
      totalDownloadSpeed: entries.reduce((sum, c) => sum + c.downloadSpeed, 0),
      totalUploadSpeed: entries.reduce((sum, c) => sum + c.uploadSpeed, 0),
    });
  },
  onStatus: (status) => {
    useConnectionsStore.getState().setStreamStatus(status);
  },
});

export function startConnectionsStream() {
  controller.start();
}

export function stopConnectionsStream(clear = false) {
  controller.stop(
    clear ? () => useConnectionsStore.getState().clear() : undefined,
  );
}
