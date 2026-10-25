import { create } from "zustand";
import type { StreamStatus } from "../daemon/subscription";

interface MemoryState {
  inuse: number;
  streamStatus: StreamStatus;
}

interface MemoryActions {
  setInuse: (inuse: number) => void;
  setStreamStatus: (status: MemoryState["streamStatus"]) => void;
  clear: () => void;
}

export const useMemoryStore = create<MemoryState & MemoryActions>((set) => ({
  inuse: 0,
  streamStatus: "disconnected",

  setInuse: (inuse) => set({ inuse }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  clear: () => set({ inuse: 0, streamStatus: "disconnected" }),
}));
