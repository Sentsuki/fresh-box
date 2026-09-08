import type { Group } from "../gen/daemon/started_service_pb";
import type { ProxyOverview } from "../types/app";
import { useProxyStore } from "../stores/proxyStore";
import { startedService } from "./clients";
import { createStreamController } from "./subscription";

/**
 * 代理组与 Clash 模式的常驻订阅。
 *
 * 以前是「每次操作现开一条 `SubscribeGroups`、读第一帧、把流扔掉」
 * （`daemon_control.rs` 的 `fetch_overview`）—— 那是把一条持续推送的流硬压成
 * 一次请求-响应，因为旧的 Clash HTTP API 里 `/proxies` 就是个 unary GET。
 * 代价是：别的客户端切了节点、urltest 组自动改选、后台测速出结果，代理页全都
 * 收不到，要等用户手动刷新（审计项 M-10）。
 *
 * 现在两条流常驻，页面上的延迟和勾选实时跟随。测速也因此简化成「触发 URLTest，
 * 然后在这条流上等结果」，不再需要自己开临时流去轮询（M-08）。
 *
 * 注意托盘是**另外**订阅的（`services::resident`）：托盘必须在窗口销毁后继续
 * 工作，不能依赖前端。同一条 RPC 两个独立消费者、同一条 HTTP/2 连接上的两个
 * stream，中间零翻译。
 */

/** 组内节点的延迟，`urlTestDelay <= 0` 视为「还没测过」。 */
function nodeDelay(delay: number): number | null {
  return delay > 0 ? delay : null;
}

function toOverview(groups: Group[], mode: ProxyOverview["current_mode"], modes: string[]): ProxyOverview {
  return {
    current_mode: mode,
    available_modes: modes,
    proxy_groups: groups
      // 只保留 daemon 自己标了 `selectable` 的组 —— 比按 `type` 字符串猜
      // （`selector`/`urltest`）准确，`selectable` 正是它对「这组能不能手动
      // 选」的回答。
      .filter((group) => group.selectable)
      .map((group) => ({
        name: group.tag,
        kind: group.type,
        current: group.selected,
        current_delay:
          nodeDelay(
            group.items.find((item) => item.tag === group.selected)
              ?.urlTestDelay ?? 0,
          ),
        options: group.items.map((item) => ({
          name: item.tag,
          kind: item.type,
          delay: nodeDelay(item.urlTestDelay),
          is_selected: item.tag === group.selected,
        })),
      })),
  };
}

/** 最近一次收到的原始组数据，供测速比对 `urlTestTime` 用。 */
let latestGroups: Group[] = [];
let latestMode = "";
let availableModes: string[] = [];

/** 组数据变化的订阅者 —— 测速要等「某个节点的 urlTestTime 变了」。 */
type GroupsListener = (groups: Group[]) => void;
const listeners = new Set<GroupsListener>();

export function onGroupsChanged(listener: GroupsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentGroups(): Group[] {
  return latestGroups;
}

function publish() {
  useProxyStore
    .getState()
    .setOverview(toOverview(latestGroups, latestMode, availableModes));
}

const groupsController = createStreamController({
  subscribe: (signal) => startedService.subscribeGroups({}, { signal }),
  onMessage: (message) => {
    latestGroups = message.group;
    publish();
    for (const listener of listeners) listener(latestGroups);
  },
  onStatus: (status) => {
    if (status === "disconnected") {
      latestGroups = [];
      availableModes = [];
      latestMode = "";
      useProxyStore.getState().clearOverview();
    }
  },
});

const modeController = createStreamController({
  subscribe: (signal) => startedService.subscribeClashMode({}, { signal }),
  onMessage: (message) => {
    latestMode = message.mode;
    // `SubscribeClashMode` 只推当前模式，不带可选模式列表。列表由配置决定、
    // 实例运行期间不变，所以取一次就够；等第一条推送到达再取，因为那意味着
    // 实例已经 started，而 `GetClashModeStatus` 恰好要求这一点。
    if (availableModes.length === 0) {
      void startedService
        .getClashModeStatus({})
        .then((status) => {
          availableModes = status.modeList;
          publish();
        })
        .catch(() => {});
    }
    publish();
  },
  onStatus: () => {},
});

export function startGroupsStream() {
  groupsController.start();
  modeController.start();
}

export function stopGroupsStream() {
  groupsController.stop();
  modeController.stop();
}
