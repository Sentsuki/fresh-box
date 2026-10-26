import { useEffect, useEffectEvent } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * 在组件挂载期间监听一个 Tauri 事件。
 *
 * `listen` 是异步的，拿到取消函数之前组件就可能已经卸载了（StrictMode 下
 * 开发环境每个 effect 都会立刻跑一遍「挂载 → 卸载 → 挂载」）。那时候必须在
 * promise 回来后马上取消，否则会留下一个永远不会被清理的监听 —— 以前四处
 * 手写的监听里有的处理了这一点，有的没有。
 *
 * `handler` 每次渲染都可以是新函数：它经过 `useEffectEvent`，总是调用最新
 * 的那个，不会因为它变了就重新订阅。
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen<T>(event, (e) => onEvent(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}
