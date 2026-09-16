import { create } from "zustand";

interface MemoryState {
  inuse: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
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
