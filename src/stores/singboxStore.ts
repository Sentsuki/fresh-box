import { create } from "zustand";

interface SingboxState {
  isRunning: boolean;
  pendingOperation: boolean;
}

interface SingboxActions {
  setRunning: (running: boolean) => void;
  setPending: (pending: boolean) => void;
}

export const useSingboxStore = create<SingboxState & SingboxActions>((set) => ({
  isRunning: false,
  pendingOperation: false,
  setRunning: (isRunning) => set({ isRunning }),
  setPending: (pendingOperation) => set({ pendingOperation }),
}));
