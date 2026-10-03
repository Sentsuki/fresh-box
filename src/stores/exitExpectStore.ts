import { create } from "zustand";
import { loadExitExpect, setExitExpect } from "../services/api";
import { getErrorMessage } from "../services/tauri";

/**
 * 期望出口：当前档案里「组 → 平时应该停在的节点」。
 *
 * 只是给代理页画图钉和「Expected」那一行用的本地副本。真正的提醒在 Rust
 * （`services::exit_reminder`），它自己读库，不依赖这里 —— 窗口关了也照样提醒。
 */
interface ExitExpectState {
  /** 这份表属于哪个档案。切档案时重新加载，异步结果按它丢弃过期的。 */
  profileId: string | null;
  expect: Record<string, string>;
}

interface ExitExpectActions {
  load: (profileId: string | null) => Promise<void>;
  /** 钉住这个节点；它已经是期望节点时则取消。 */
  toggle: (
    group: string,
    node: string,
    onError?: (msg: string) => void,
  ) => Promise<void>;
  clear: (group: string, onError?: (msg: string) => void) => Promise<void>;
}

export const useExitExpectStore = create<ExitExpectState & ExitExpectActions>(
  (set, get) => {
    async function write(
      group: string,
      node: string | null,
      onError?: (msg: string) => void,
    ) {
      const { profileId, expect: previous } = get();
      if (!profileId) return;

      // 乐观更新：图钉点下去就该亮，不等一次 IPC。
      const optimistic = { ...previous };
      if (node === null) delete optimistic[group];
      else optimistic[group] = node;
      set({ expect: optimistic });

      try {
        const saved = await setExitExpect(profileId, group, node);
        if (get().profileId === profileId) set({ expect: saved });
      } catch (error) {
        if (get().profileId === profileId) set({ expect: previous });
        onError?.(
          `Failed to save expected outbound: ${getErrorMessage(error)}`,
        );
      }
    }

    return {
      profileId: null,
      expect: {},

      load: async (profileId) => {
        // 同一个档案重新加载（每次进代理页都会）时先留着旧表，免得图钉闪一下。
        if (get().profileId !== profileId) set({ profileId, expect: {} });
        if (!profileId) return;
        try {
          const expect = await loadExitExpect(profileId);
          if (get().profileId === profileId) set({ expect });
        } catch {
          // 读不到就当没设过 —— 图钉只是提示，不值得为它弹错误。
        }
      },

      toggle: async (group, node, onError) => {
        const next = get().expect[group] === node ? null : node;
        await write(group, next, onError);
      },

      clear: async (group, onError) => {
        await write(group, null, onError);
      },
    };
  },
);
