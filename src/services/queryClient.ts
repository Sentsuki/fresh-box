import { QueryClient } from "@tanstack/react-query";

/**
 * 页面上「读一次、显示加载中/失败、操作完再读」的那类数据都走这里。
 *
 * 数据源是本机的 Tauri 命令，不是网络请求：失败是确定性的（服务没装、权限
 * 不够），重试只会让失败来得更慢，所以关掉。窗口重新聚焦时也不自动重拉 ——
 * 托盘应用的窗口频繁地显示/隐藏，每次都去问一遍系统服务状态没有意义；进页面
 * 时（staleTime 为 0）照常重新读，和以前每次挂载都读一遍的行为一致，只是读到
 * 之前先显示上一次的结果，不再从转圈开始。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

/** 所有查询的 key。集中在一处，操作完成后要作废哪条查询时不会拼错。 */
export const queryKeys = {
  appVersion: ["appVersion"],
  daemonServiceInstalled: ["daemonServiceInstalled"],
  autostartEnabled: ["autostartEnabled"],
  coreVersion: ["coreVersion"],
  workingDirectory: ["workingDirectory"],
  configOverride: ["configOverride"],
  reports: (kind: string) => ["reports", kind],
  reportFiles: (kind: string, id: string) => ["reports", kind, id],
  priorityConfig: (profileId: string | null) => ["priorityConfig", profileId],
} as const;
