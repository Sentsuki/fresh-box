import { create } from "zustand";
import { getErrorMessage } from "../services/tauri";
import type { ProxyOverview } from "../types/app";
import { startedService } from "../daemon/clients";
import {
  awaitGroupDelays,
  awaitNodeDelay,
  closeConnectionsByGroup,
} from "../daemon/proxyActions";
import { useSettingsStore } from "./settingsStore";

interface ProxyState {
  overview: ProxyOverview | null;
  errorMessage: string | null;
  isRefreshing: boolean;
  activeMode: string | null;
  activeSelectionKey: string | null;
  activeDelayNodes: Set<string>;
  activeGroupDelay: string | null;
  groupTestingNodes: Set<string>;
}

interface ProxyActions {
  /** 代理组现在由 `daemon/groupsStream.ts` 的常驻订阅推送 —— 不再需要拉取。
   * 保留这个入口是因为它是幂等的「确保流开着」，调用点不用改。 */
  refreshOverview: (showToastOnError?: boolean) => Promise<void>;
  setOverview: (overview: ProxyOverview) => void;
  clearOverview: () => void;
  changeMode: (
    mode: string,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void,
  ) => Promise<void>;
  switchProxy: (
    proxyGroup: string,
    proxyName: string,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void,
  ) => Promise<void>;
  testDelay: (
    proxyName: string,
    onResult?: (msg: string, isOk: boolean) => void,
    onError?: (msg: string) => void,
  ) => Promise<void>;
  testGroupDelay: (
    proxyGroup: string,
    onSuccess?: (msg: string) => void,
    onError?: (msg: string) => void,
  ) => Promise<void>;
}

export const useProxyStore = create<ProxyState & ProxyActions>((set, get) => ({
  overview: null,
  errorMessage: null,
  isRefreshing: false,
  activeMode: null,
  activeSelectionKey: null,
  activeDelayNodes: new Set<string>(),
  activeGroupDelay: null,
  groupTestingNodes: new Set<string>(),

  refreshOverview: async () => {
    // 数据由常驻订阅推送，这里没有什么可拉的 —— 只是把上一次的错误态清掉，
    // 让「重试」之类的入口有个明确的行为。
    set({ errorMessage: null, isRefreshing: false });
  },

  setOverview: (overview) => set({ overview, errorMessage: null }),

  clearOverview: () => {
    set({
      overview: null,
      errorMessage: null,
      isRefreshing: false,
      activeMode: null,
      activeSelectionKey: null,
      activeDelayNodes: new Set<string>(),
      activeGroupDelay: null,
    });
  },

  changeMode: async (mode, onSuccess, onError) => {
    const state = get();
    if (
      !mode.trim() ||
      state.activeMode === mode ||
      state.overview?.current_mode === mode
    ) {
      return;
    }
    set({ activeMode: mode });
    try {
      await startedService.setClashMode({ mode });
      // 新模式由 `SubscribeClashMode` 推回来，不在这里手动改 —— 让 daemon 当
      // 唯一真相源，就不会出现「点了但没生效却已经显示切换成功」。
      onSuccess?.(`Proxy mode switched to ${mode}`);
    } catch (error) {
      onError?.(`Failed to switch proxy mode: ${getErrorMessage(error)}`);
    } finally {
      set({ activeMode: null });
    }
  },

  switchProxy: async (proxyGroup, proxyName, onSuccess, onError) => {
    const actionKey = `${proxyGroup}:${proxyName}`;
    if (get().activeSelectionKey === actionKey) return;
    set({ activeSelectionKey: actionKey });
    try {
      await startedService.selectOutbound({
        groupTag: proxyGroup,
        outboundTag: proxyName,
      });
      if (useSettingsStore.getState().settings.settings.auto_close_connections) {
        await closeConnectionsByGroup(proxyGroup);
      }
      // 勾选同样由 `SubscribeGroups` 推回来。
      onSuccess?.(`Switched ${proxyGroup} to ${proxyName}`);
    } catch (error) {
      onError?.(`Failed to switch proxy node: ${getErrorMessage(error)}`);
    } finally {
      set({ activeSelectionKey: null });
    }
  },

  testDelay: async (proxyName, onResult, onError) => {
    if (get().activeDelayNodes.has(proxyName)) return;
    set((s) => {
      const next = new Set(s.activeDelayNodes);
      next.add(proxyName);
      return { activeDelayNodes: next };
    });
    try {
      const delay = await awaitNodeDelay(proxyName);
      set((s) => ({
        overview: s.overview
          ? {
              ...s.overview,
              proxy_groups: s.overview.proxy_groups.map((group) => ({
                ...group,
                options: group.options.map((node) =>
                  node.name === proxyName ? { ...node, delay } : node,
                ),
              })),
            }
          : null,
        errorMessage: null,
      }));

      if (typeof delay === "number" && delay >= 0) {
        onResult?.(`${proxyName}: ${delay} ms`, true);
      } else {
        onResult?.(`${proxyName}: timeout`, false);
      }
    } catch (error) {
      onError?.(`Failed to test node latency: ${getErrorMessage(error)}`);
      set((s) => {
        if (!s.overview) return {};
        return {
          overview: {
            ...s.overview,
            proxy_groups: s.overview.proxy_groups.map((group) => ({
              ...group,
              options: group.options.map((node) =>
                node.name === proxyName ? { ...node, delay: -1 } : node,
              ),
            })),
          },
        };
      });
    } finally {
      set((s) => {
        const next = new Set(s.activeDelayNodes);
        next.delete(proxyName);
        return { activeDelayNodes: next };
      });
    }
  },

  testGroupDelay: async (proxyGroup, onSuccess, onError) => {
    if (get().activeGroupDelay === proxyGroup) return;
    set({ activeGroupDelay: proxyGroup });

    try {
      let overview = get().overview;
      let group = overview?.proxy_groups.find((g) => g.name === proxyGroup);
      let nodes = group?.options.map((n) => n.name) ?? [];

      if (nodes.length === 0) {
        await get().refreshOverview(); // fetch nodes first
        overview = get().overview;
        group = overview?.proxy_groups.find((g) => g.name === proxyGroup);
        nodes = group?.options.map((n) => n.name) ?? [];

        if (nodes.length === 0) {
          onSuccess?.(`${proxyGroup}: no nodes found`);
          return;
        }
      }

      // Reached whether nodes were already available or just fetched above.
      set({ groupTestingNodes: new Set(nodes) });

      const results = await awaitGroupDelays(proxyGroup, nodes);

      set((s) => ({
        overview: s.overview
          ? {
              ...s.overview,
              proxy_groups: s.overview.proxy_groups.map((g) => {
                if (g.name === proxyGroup) {
                  return {
                    ...g,
                    options: g.options.map((node) => ({
                      ...node,
                      delay:
                        results[node.name] !== undefined
                          ? results[node.name]
                          : -1,
                    })),
                  };
                }
                return g;
              }),
            }
          : null,
        errorMessage: null,
      }));

      onSuccess?.(`${proxyGroup}: tested ${Object.keys(results).length} nodes`);
    } catch (error) {
      onError?.(`Failed to test group latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeGroupDelay: null, groupTestingNodes: new Set() });
    }
  },
}));
