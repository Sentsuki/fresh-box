import type { Group } from "../gen/daemon/started_service_pb";
import type { ProxyOverview } from "../types/app";

/**
 * daemon 的 `Group` → 代理页的视图模型。
 *
 * 这个函数就是整个 Clash 翻译层的替代品：以前 Rust 把 boxdd 的组数据重排成
 * 一份**假装是 Clash `/proxies` 响应**的结构（`daemon_control.rs`），一半字段
 * 是硬造的空值。现在只有这么一段，做的都是显示层该做的取舍，而且看得见。
 *
 * 单独成文件是为了能测 —— `groupsStream.ts` 顶层就要建订阅。
 */

/** 组内节点的延迟，`urlTestDelay <= 0` 视为「还没测过」。 */
function nodeDelay(delay: number): number | null {
  return delay > 0 ? delay : null;
}

export function toOverview(groups: Group[], mode: ProxyOverview["current_mode"], modes: string[]): ProxyOverview {
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
