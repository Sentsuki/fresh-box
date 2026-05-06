import { create } from "zustand";
import type { AppPage } from "../types/app";

interface AppState {
  currentPage: AppPage;
  initialized: boolean;
}

interface AppActions {
  setCurrentPage: (page: AppPage) => void;
  markInitialized: () => void;
}

export const useAppStore = create<AppState & AppActions>((set) => ({
  currentPage: "overview",
  initialized: false,
  setCurrentPage: (page) => set({ currentPage: page }),
  markInitialized: () => set({ initialized: true }),
}));
