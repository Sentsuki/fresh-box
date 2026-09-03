import { create } from "zustand";
import type { AppPage } from "../types/app";
import { useSettingsStore } from "./settingsStore";

interface AppState {
  currentPage: AppPage;
  initialized: boolean;
}

interface AppActions {
  /**
   * The only way to change the current page. Updates this store
   * synchronously — the actual source of truth every component renders
   * off, so navigation stays instant — and persists the choice to
   * settings as a fire-and-forget side effect, so a relaunch remembers
   * it. Before this, callers (just `Sidebar`) had to remember to update
   * *both* this store and `useSettingsStore` themselves; nothing enforced
   * the two stayed in sync.
   */
  setCurrentPage: (page: AppPage) => void;
  /** Seed the initial page from settings at startup, without re-persisting
   * the same value right back through `setCurrentPage` — see
   * `useInit.ts`. */
  setInitialPage: (page: AppPage) => void;
  markInitialized: () => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  currentPage: "overview",
  initialized: false,
  setCurrentPage: (page) => {
    set({ currentPage: page });
    void useSettingsStore.getState().setCurrentPage(page);
  },
  setInitialPage: (page) => set({ currentPage: page }),
  markInitialized: () => set({ initialized: true }),
}));
