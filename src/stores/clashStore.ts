import { create } from "zustand";
import {
  getClashOverview,
  selectClashProxy,
  testClashProxyDelay,
  testClashProxyGroupDelay,
  updateClashMode,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import type { ClashOverview } from "../types/app";

interface ClashState {
  overview: ClashOverview | null;
  errorMessage: string | null;
  isRefreshing: boolean;
  activeMode: string | null;
  activeSelectionKey: string | null;
  activeDelayNode: string | null;
  activeGroupDelay: string | null;
  groupTestingNodes: Set<string>;
}

interface ClashActions {
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

function findDelay(
  overview: ClashOverview | null,
  proxyName: string,
): number | null | undefined {
  return overview?.proxy_groups
    .flatMap((g) => g.options)
    .find((n) => n.name === proxyName)?.delay;
}

export const useClashStore = create<ClashState & ClashActions>((set, get) => ({
  overview: null,
  errorMessage: null,
  isRefreshing: false,
  activeMode: null,
  activeSelectionKey: null,
  activeDelayNode: null,
  activeGroupDelay: null,
  groupTestingNodes: new Set<string>(),

  refreshOverview: async (showToastOnError = false) => {
    const sequence = ++requestSequence;
    set({ isRefreshing: true });
    try {
      const overview = await getClashOverview();
      if (sequence === requestSequence) {
        set({ overview, errorMessage: null });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (sequence === requestSequence) {
        set({ overview: null, errorMessage: message });
      }
      if (showToastOnError) {
        console.warn(`Failed to load Clash data: ${message}`);
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
      activeDelayNode: null,
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
      const overview = await updateClashMode(mode);
      set({ overview, errorMessage: null });
      onSuccess?.(`Clash mode switched to ${mode}`);
    } catch (error) {
      onError?.(`Failed to switch Clash mode: ${getErrorMessage(error)}`);
    } finally {
      set({ activeMode: null });
    }
  },

  switchProxy: async (proxyGroup, proxyName, onSuccess, onError) => {
    const actionKey = `${proxyGroup}:${proxyName}`;
    if (get().activeSelectionKey === actionKey) return;
    set({ activeSelectionKey: actionKey });
    try {
      const overview = await selectClashProxy(proxyGroup, proxyName);
      set({ overview, errorMessage: null });
      onSuccess?.(`Switched ${proxyGroup} to ${proxyName}`);
    } catch (error) {
      onError?.(`Failed to switch proxy node: ${getErrorMessage(error)}`);
    } finally {
      set({ activeSelectionKey: null });
    }
  },

  testDelay: async (proxyName, onResult, onError) => {
    if (get().activeDelayNode === proxyName) return;
    set({ activeDelayNode: proxyName });
    try {
      const overview = await testClashProxyDelay(proxyName);
      set({ overview, errorMessage: null });
      const delay = findDelay(overview, proxyName);
      if (typeof delay === "number" && delay >= 0) {
        onResult?.(`${proxyName}: ${delay} ms`, true);
      } else {
        onResult?.(`${proxyName}: timeout`, false);
      }
    } catch (error) {
      onError?.(`Failed to test node latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeDelayNode: null });
    }
  },

  testGroupDelay: async (proxyGroup, onSuccess, onError) => {
    if (get().activeGroupDelay === proxyGroup) return;
    set({ activeGroupDelay: proxyGroup });

    try {
      const overview = get().overview;
      const group = overview?.proxy_groups.find((g) => g.name === proxyGroup);
      const nodes = group?.options.map((n) => n.name) ?? [];

      if (nodes.length === 0) {
        const refreshed = await testClashProxyGroupDelay(proxyGroup);
        set({ overview: refreshed, errorMessage: null });
        const g = refreshed.proxy_groups.find((g) => g.name === proxyGroup);
        onSuccess?.(`${proxyGroup}: tested ${g?.options.length ?? 0} nodes`);
        return;
      }

      // Add all nodes to groupTestingNodes
      set({ groupTestingNodes: new Set(nodes) });

      const BATCH = 5;
      let testedCount = 0;
      for (let i = 0; i < nodes.length; i += BATCH) {
        const chunk = nodes.slice(i, i + BATCH);
        await Promise.allSettled(
          chunk.map(async (name) => {
            try {
              const updated = await testClashProxyDelay(name);
              set((s) => ({
                overview: updated,
                errorMessage: null,
                groupTestingNodes: new Set(
                  [...s.groupTestingNodes].filter((n) => n !== name),
                ),
              }));
            } catch {
              set((s) => ({
                groupTestingNodes: new Set(
                  [...s.groupTestingNodes].filter((n) => n !== name),
                ),
              }));
            }
            testedCount++;
          }),
        );
      }

      onSuccess?.(`${proxyGroup}: tested ${testedCount} nodes`);
    } catch (error) {
      onError?.(`Failed to test group latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeGroupDelay: null, groupTestingNodes: new Set() });
    }
  },
}));
