import { useConnectionsStore } from "../hooks/useConnectionsStream";
import { applyEvent } from "./connectionEntries";
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
 * 累加本身在 `connectionEntries.ts` 里，这里只负责订阅、攒帧、推给 store。
 */

/**
 * `SubscribeConnectionsRequest.interval` 同样是 Go 的 `time.Duration`，
 * 单位纳秒 —— 和 `statusStream.ts` 里的 `STATUS_INTERVAL_NANOS` 同理。
 */
const CONNECTIONS_INTERVAL_NANOS = 1_000n * 1_000_000n;

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
