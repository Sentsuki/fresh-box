import { create } from "zustand";
import { checkForUpdate } from "../services/api";
import { getErrorMessage } from "../services/tauri";
import type { UpdateInfo } from "../types/app";

/**
 * The latest known result of a GitHub-release update check — populated
 * either passively (the `update-available` event from `main.rs`'s one-shot
 * startup check, via `App.tsx`) or actively (`checkNow`, from Settings'
 * "Check for Updates" button). Detection only: acting on `info.available`
 * always means the user clicking through to `info.releaseUrl` themselves —
 * see `UpdateInfo`'s doc comment.
 */
interface UpdateState {
  info: UpdateInfo | null;
  isChecking: boolean;
  checkError: string | null;
  setInfo: (info: UpdateInfo) => void;
  checkNow: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  info: null,
  isChecking: false,
  checkError: null,

  setInfo: (info) => set({ info, checkError: null }),

  checkNow: async () => {
    set({ isChecking: true, checkError: null });
    try {
      const info = await checkForUpdate();
      set({ info, isChecking: false });
    } catch (error) {
      set({ isChecking: false, checkError: getErrorMessage(error) });
    }
  },
}));
