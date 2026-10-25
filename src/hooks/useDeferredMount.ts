import { useEffect, useState } from "react";

/**
 * 挂载后隔一拍才返回 `true`。
 *
 * 连接表、日志列表这种上千行的虚拟列表，首次渲染要占掉一整帧以上；跟页面
 * 本身同一帧挂载的话，切页的过渡动画会先卡住一下。先把页面框架画出来，下一拍
 * 再挂重的那部分，动画就是顺的。
 */
export function useDeferredMount(delayMs = 10): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return ready;
}
