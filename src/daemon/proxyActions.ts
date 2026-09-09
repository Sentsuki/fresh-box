import type { Group } from "../gen/daemon/started_service_pb";
import { startedService } from "./clients";
import { currentGroups, onGroupsChanged } from "./groupsStream";
import { useConnectionsStore } from "../hooks/useConnectionsStream";

/**
 * 测速与切换节点的副作用。
 *
 * 这些以前在 `daemon_control.rs` 里，每个都要自己开一条临时流去等结果。现在
 * 代理组是一条常驻订阅（`groupsStream.ts`），等结果就是在那条流上等 ——
 * 没有额外的流，也没有「先触发再订阅」的竞态。
 */

/** 测速等待上限。到点还没结果就当超时，和以前的默认值一致。 */
const DELAY_TEST_TIMEOUT_MS = 5_000;

function findItem(groups: Group[], tag: string) {
  for (const group of groups) {
    const item = group.items.find((candidate) => candidate.tag === tag);
    if (item) return item;
  }
  return undefined;
}

/*
 * 方法名是 `uRLTest` 而不是 `urlTest`：proto 里叫 `URLTest`，protobuf-es 的
 * 驼峰化规则把首字母小写后得到 `uRLTest`。别「顺手改正」它，那样就对不上生成
 * 的 stub 了。
 */

/**
 * 触发单个节点的 URL 测速，等到它的结果刷新为止。
 *
 * `URLTest` 是 fire-and-forget，不返回延迟 —— 结果通过 `SubscribeGroups` 推
 * 回来。判定「这是新结果」靠 `urlTestTime` 变化而不是 `urlTestDelay` 变化：
 * 两次测速完全可能得到同一个延迟值。
 *
 * 顺序很重要：**先记下基线再触发**。反过来的话，结果可能在记基线之前就到了，
 * 于是永远等不到「变化」——`test_proxy_group_delay` 以前就是反的（审计项 M-08）。
 */
export function awaitNodeDelay(tag: string): Promise<number> {
  const baseline = findItem(currentGroups(), tag)?.urlTestTime;

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      fn();
    };

    const unsubscribe = onGroupsChanged((groups) => {
      const item = findItem(groups, tag);
      if (item && item.urlTestTime !== baseline) {
        finish(() => resolve(item.urlTestDelay));
      }
    });

    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(`Timed out waiting for a delay result for '${tag}'.`),
          ),
        ),
      DELAY_TEST_TIMEOUT_MS,
    );

    startedService
      .uRLTest({ outboundTag: tag })
      .catch((error: unknown) => finish(() => reject(error)));
  });
}

/**
 * 触发整组测速，等到组内所有节点都出结果（或超时）。
 *
 * 比旧实现好在两点：一是先记基线再触发（同上），二是**结果齐了就返回**——
 * 旧的循环只在超时或流结束时退出，所以不管节点多快，组测速固定卡满 5 秒。
 */
export function awaitGroupDelays(
  groupTag: string,
  nodes: string[],
): Promise<Record<string, number>> {
  const baseline = new Map<string, bigint | undefined>();
  for (const node of nodes) {
    baseline.set(node, findItem(currentGroups(), node)?.urlTestTime);
  }

  return new Promise<Record<string, number>>((resolve, reject) => {
    const results: Record<string, number> = {};
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      fn();
    };

    const collect = (groups: Group[]) => {
      for (const node of nodes) {
        if (node in results) continue;
        const item = findItem(groups, node);
        if (item && item.urlTestTime !== baseline.get(node)) {
          results[node] = item.urlTestDelay;
        }
      }
      if (Object.keys(results).length === nodes.length) {
        finish(() => resolve(results));
      }
    };

    const unsubscribe = onGroupsChanged(collect);

    // 超时不算失败：把已经拿到的结果交回去，没测出来的按「超时」处理（调用方
    // 对缺席的节点填 -1）。整组里有一两个节点不可达是常态。
    const timer = setTimeout(
      () => finish(() => resolve(results)),
      DELAY_TEST_TIMEOUT_MS,
    );

    startedService
      .uRLTest({ outboundTag: groupTag })
      .then(() => collect(currentGroups()))
      .catch((error: unknown) => finish(() => reject(error)));
  });
}

/**
 * 关掉链路里经过 `groupTag` 的全部连接 —— 切换节点后可选的清理动作。
 *
 * 以前 Rust 要为此另开一条 `SubscribeConnections` 取一帧快照
 * （`close_connections_by_group`）。前端本来就持有活跃连接表，直接过滤即可。
 *
 * 托盘那条路径仍然在 Rust 里有一份（`services::resident`）—— 窗口销毁后托盘
 * 还要能切节点，那时前端根本不存在。这是「关了窗口还得跑的留在 Rust」这条
 * 规则的直接后果，不是重复实现的疏忽。
 */
export async function closeConnectionsByGroup(groupTag: string): Promise<void> {
  const targets = useConnectionsStore
    .getState()
    .active.filter((connection) => connection.chains.includes(groupTag))
    .map((connection) => connection.id);

  await Promise.allSettled(
    targets.map((id) => startedService.closeConnection({ id })),
  );
}
