import { create } from "zustand";
import {
  getProxyOverview,
  selectProxy,
  testProxyDelay,
  testProxyGroupDelay,
  updateProxyMode,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import type { ProxyOverview } from "../types/app";

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
  refreshOverview: (showToastOnError?: boolean) => Promise<void>;
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

let requestSequence = 0;

export const useProxyStore = create<ProxyState & ProxyActions>((set, get) => ({
  overview: null,
  errorMessage: null,
  isRefreshing: false,
  activeMode: null,
  activeSelectionKey: null,
  activeDelayNodes: new Set<string>(),
  activeGroupDelay: null,
  groupTestingNodes: new Set<string>(),

  refreshOverview: async (showToastOnError = false) => {
    const sequence = ++requestSequence;
    set({ isRefreshing: true });
    try {
      const overview = await getProxyOverview();
      if (sequence === requestSequence) {
        set({ overview, errorMessage: null });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (sequence === requestSequence) {
        set({ overview: null, errorMessage: message });
      }
      if (showToastOnError) {
        console.warn(`Failed to load proxy data: ${message}`);
      }
    } finally {
      if (sequence === requestSequence) {
        set({ isRefreshing: false });
      }
    }
  },

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
      const overview = await updateProxyMode(mode);
      set({ overview, errorMessage: null });
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
      const overview = await selectProxy(proxyGroup, proxyName);
      set({ overview, errorMessage: null });
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
      const delay = await testProxyDelay(proxyName);
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

      const results = await testProxyGroupDelay(proxyGroup);

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
