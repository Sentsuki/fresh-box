import type { ConnectionEntry } from "../types/app";
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

/**
 * 累加表本身，常驻在模块里 —— **不是** store 里那份的副本。
 *
 * 以前每一帧都从 `store.active` 这个数组重建一次 `Map`、再把 `Map` 摊回数组：
 * 两趟 O(n) 的往返，只为了拿到一个上一帧结束时就已经在手里的结构。连接多的
 * 时候（几千条）这是每秒都在做的无用功。
 *
 * 现在 store 只存**派生结果**（渲染用的数组），真相在这里。两者的更新仍然是
 * 一次 `setFrame`，所以每帧还是只触发一次渲染。
 */
let active = new Map<string, ConnectionEntry>();
let closed: ConnectionEntry[] = [];

const controller = createStreamController({
  subscribe: (signal) =>
    startedService.subscribeConnections(
      { interval: CONNECTIONS_INTERVAL_NANOS },
      { signal },
    ),
  onMessage: (frame) => {
    const store = useConnectionsStore.getState();
    if (store.isPaused) return;

    if (frame.reset) {
      active.clear();
    }
    for (const event of frame.events) {
      applyEvent(active, closed, event);
    }
    if (closed.length > MAX_CLOSED) {
      // 就地截断，别每帧都 slice 出一份新数组 —— `applyEvent` 往头部
      // `unshift`，所以砍掉的是最旧的那些。
      closed.length = MAX_CLOSED;
    }

    const entries = [...active.values()];
    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    for (const entry of entries) {
      totalDownloadSpeed += entry.downloadSpeed;
      totalUploadSpeed += entry.uploadSpeed;
    }

    store.setFrame({
      connections: entries,
      // store 拿到的必须是一份快照：下一帧会继续原地改 `closed`，直接把它
      // 递过去等于让 React 拿到一个会背着它变的数组。
      closed: [...closed],
      totalDownloadSpeed,
      totalUploadSpeed,
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
    clear
      ? () => {
          // 累加表和 store 一起清 —— 真相在这里，只清 store 的话下一帧会把
          // 停止之前那批连接原样推回去。
          active = new Map();
          closed = [];
          useConnectionsStore.getState().clear();
        }
      : undefined,
  );
}
