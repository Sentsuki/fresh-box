import { create } from 'zustand';
import {
  getClashOverview,
  selectClashProxy,
  testClashProxyDelay,
  testClashProxyGroupDelay,
  updateClashMode,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import type { ClashOverview } from "../types/app";
import { toast } from "./useToast";

interface ClashState {
  overview: ClashOverview | null;
  errorMessage: string | null;
  isRefreshing: boolean;
  activeMode: string | null;
  activeSelectionKey: string | null;
  activeDelayNode: string | null;
  activeGroupDelay: string | null;
  refreshOverview: (showToastOnError?: boolean) => Promise<void>;
  clearOverview: () => void;
  changeMode: (mode: string) => Promise<void>;
  switchProxy: (proxyGroup: string, proxyName: string) => Promise<void>;
  testDelay: (proxyName: string) => Promise<void>;
  testGroupDelay: (proxyGroup: string) => Promise<void>;
}

let requestSequence = 0;

function findDelay(
  nextOverview: ClashOverview | null,
  proxyName: string,
): number | null | undefined {
  return nextOverview?.proxy_groups
    .flatMap((group) => group.options)
    .find((node) => node.name === proxyName)?.delay;
}

export const useClashStore = create<ClashState>((set, get) => ({
  overview: null,
  errorMessage: null,
  isRefreshing: false,
  activeMode: null,
  activeSelectionKey: null,
  activeDelayNode: null,
  activeGroupDelay: null,
  refreshOverview: async (showToastOnError = false) => {
    const sequence = ++requestSequence;
    set({ isRefreshing: true });

    try {
      const nextOverview = await getClashOverview();
      if (sequence === requestSequence) {
        set({ overview: nextOverview, errorMessage: null });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (sequence === requestSequence) {
        set({ overview: null, errorMessage: message });
      }
      if (showToastOnError) {
        toast.error(`Failed to load Clash data: ${message}`);
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
  changeMode: async (mode: string) => {
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
      const nextOverview = await updateClashMode(mode);
      set({ overview: nextOverview, errorMessage: null });
      toast.success(`Clash mode switched to ${mode}`);
    } catch (error) {
      toast.error(`Failed to switch Clash mode: ${getErrorMessage(error)}`);
    } finally {
      set({ activeMode: null });
    }
  },
  switchProxy: async (proxyGroup: string, proxyName: string) => {
    const actionKey = `${proxyGroup}:${proxyName}`;
    if (get().activeSelectionKey === actionKey) {
      return;
    }

    set({ activeSelectionKey: actionKey });
    try {
      const nextOverview = await selectClashProxy(proxyGroup, proxyName);
      set({ overview: nextOverview, errorMessage: null });
      toast.success(`Switched ${proxyGroup} to ${proxyName}`);
    } catch (error) {
      toast.error(`Failed to switch proxy node: ${getErrorMessage(error)}`);
    } finally {
      set({ activeSelectionKey: null });
    }
  },
  testDelay: async (proxyName: string) => {
    if (get().activeDelayNode === proxyName) {
      return;
    }

    set({ activeDelayNode: proxyName });
    try {
      const nextOverview = await testClashProxyDelay(proxyName);
      set({ overview: nextOverview, errorMessage: null });

      const delay = findDelay(nextOverview, proxyName);
      if (typeof delay === "number" && delay >= 0) {
        toast.success(`${proxyName}: ${delay} ms`);
      } else {
        toast.info(`${proxyName}: timeout`);
      }
    } catch (error) {
      toast.error(`Failed to test node latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeDelayNode: null });
    }
  },
  testGroupDelay: async (proxyGroup: string) => {
    if (get().activeGroupDelay === proxyGroup) {
      return;
    }

    set({ activeGroupDelay: proxyGroup });
    try {
      const nextOverview = await testClashProxyGroupDelay(proxyGroup);
      set({ overview: nextOverview, errorMessage: null });

      const group = nextOverview.proxy_groups.find((item) => item.name === proxyGroup);
      toast.success(
        `${proxyGroup}: tested ${group?.options.length ?? 0} nodes`,
      );
    } catch (error) {
      toast.error(`Failed to test group latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeGroupDelay: null });
    }
  },
}));

export function useClash() {
  const store = useClashStore();
  return {
    ...store,
    hasData: store.overview !== null,
  };
}
