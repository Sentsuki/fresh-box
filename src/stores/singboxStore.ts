import { create } from "zustand";
import type { DaemonConnectionPhase } from "../types/daemon";

interface SingboxState {
  isRunning: boolean;
  pendingOperation: boolean;
  /** The full phase — most UI only needs `isRunning`, but this carries the
   * detail for the cases that aren't just "running or not" (not installed,
   * version mismatch, owned by another user, ...). */
  connectionPhase: DaemonConnectionPhase;
}

interface SingboxActions {
  setRunning: (running: boolean) => void;
  setPending: (pending: boolean) => void;
  setConnectionPhase: (phase: DaemonConnectionPhase) => void;
}

export const useSingboxStore = create<SingboxState & SingboxActions>((set) => ({
  isRunning: false,
  pendingOperation: false,
  connectionPhase: { phase: "connecting" },
  setRunning: (isRunning) => set({ isRunning }),
  setPending: (pendingOperation) => set({ pendingOperation }),
  setConnectionPhase: (connectionPhase) => set({ connectionPhase }),
}));
