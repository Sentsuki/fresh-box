import { produce } from "immer";
import { create } from "zustand";
import { getErrorMessage } from "../services/tauri";
import type { ProxyOverview } from "../types/app";
import { startedService } from "../daemon/clients";
import {
  awaitGroupDelays,
  awaitNodeDelay,
  closeConnectionsByGroup,
} from "../daemon/proxyActions";
import { toast } from "../hooks/useToast";
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
  refreshOverview: () => Promise<void>;
  setOverview: (overview: ProxyOverview) => void;
  clearOverview: () => void;
  // 下面这些动作的结果直接弹 toast：以前是让调用方传 onSuccess/onError 进来，
  // 只因为 Fluent 的 toast 只能在组件里拿到，`useProxy` 那一层就是专门干这个转接的。
  changeMode: (mode: string) => Promise<void>;
  switchProxy: (proxyGroup: string, proxyName: string) => Promise<void>;
  testDelay: (proxyName: string) => Promise<void>;
  testGroupDelay: (proxyGroup: string) => Promise<void>;
}

/**
 * 把测速结果写到 overview 的节点上。`delayOf` 对不该改的节点返回
 * `undefined`；单节点测速改的是所有组里的同名节点，整组测速只改那一组。
 *
 * 这只是推送到达前的即时反馈 —— 下一帧 `SubscribeGroups` 会带着同样的结果
 * 把整份 overview 换掉。
 */
function withDelays(
  overview: ProxyOverview | null,
  delayOf: (group: string, node: string) => number | undefined,
): ProxyOverview | null {
  if (!overview) return null;
  return produce(overview, (draft) => {
    for (const group of draft.proxy_groups) {
      for (const node of group.options) {
        const delay = delayOf(group.name, node.name);
        if (delay !== undefined) node.delay = delay;
      }
    }
  });
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

  changeMode: async (mode) => {
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
      toast.success(`Proxy mode switched to ${mode}`);
    } catch (error) {
      toast.error(`Failed to switch proxy mode: ${getErrorMessage(error)}`);
    } finally {
      set({ activeMode: null });
    }
  },

  switchProxy: async (proxyGroup, proxyName) => {
    const actionKey = `${proxyGroup}:${proxyName}`;
    if (get().activeSelectionKey === actionKey) return;
    set({ activeSelectionKey: actionKey });
    try {
      await startedService.selectOutbound({
        groupTag: proxyGroup,
        outboundTag: proxyName,
      });
      if (
        useSettingsStore.getState().settings.settings.auto_close_connections
      ) {
        await closeConnectionsByGroup(proxyGroup);
      }
      // 勾选同样由 `SubscribeGroups` 推回来。
      toast.success(`Switched ${proxyGroup} to ${proxyName}`);
    } catch (error) {
      toast.error(`Failed to switch proxy node: ${getErrorMessage(error)}`);
    } finally {
      set({ activeSelectionKey: null });
    }
  },

  testDelay: async (proxyName) => {
    if (get().activeDelayNodes.has(proxyName)) return;
    set((s) => {
      const next = new Set(s.activeDelayNodes);
      next.add(proxyName);
      return { activeDelayNodes: next };
    });
    try {
      const delay = await awaitNodeDelay(proxyName);
      set((s) => ({
        overview: withDelays(s.overview, (_, node) =>
          node === proxyName ? delay : undefined,
        ),
        errorMessage: null,
      }));

      if (typeof delay === "number" && delay >= 0) {
        toast.success(`${proxyName}: ${delay} ms`);
      } else {
        // 超时既不是成功也不是错误 —— 节点不通是常态，不值得一条红色提示。
        toast.info(`${proxyName}: timeout`);
      }
    } catch (error) {
      toast.error(`Failed to test node latency: ${getErrorMessage(error)}`);
      set((s) => ({
        overview: withDelays(s.overview, (_, node) =>
          node === proxyName ? -1 : undefined,
        ),
      }));
    } finally {
      set((s) => {
        const next = new Set(s.activeDelayNodes);
        next.delete(proxyName);
        return { activeDelayNodes: next };
      });
    }
  },

  testGroupDelay: async (proxyGroup) => {
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
          toast.success(`${proxyGroup}: no nodes found`);
          return;
        }
      }

      // Reached whether nodes were already available or just fetched above.
      set({ groupTestingNodes: new Set(nodes) });

      const results = await awaitGroupDelays(proxyGroup, nodes);

      // 没测出来的节点填 -1：留着旧延迟等于显示一个已经不成立的数字。
      set((s) => ({
        overview: withDelays(s.overview, (group, node) =>
          group === proxyGroup ? (results[node] ?? -1) : undefined,
        ),
        errorMessage: null,
      }));

      toast.success(
        `${proxyGroup}: tested ${Object.keys(results).length} nodes`,
      );
    } catch (error) {
      toast.error(`Failed to test group latency: ${getErrorMessage(error)}`);
    } finally {
      set({ activeGroupDelay: null, groupTestingNodes: new Set() });
    }
  },
}));
