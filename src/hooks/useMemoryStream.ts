import { create } from "zustand";
import { startStatusStream, stopStatusStream } from "../daemon/statusStream";

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

// 与流量共用同一条 `SubscribeStatus` —— 见 `daemon/statusStream.ts`。
export const startMemoryStream = startStatusStream;
export const stopMemoryStream = stopStatusStream;

export function useMemoryStream() {
  const inuse = useMemoryStore((s) => s.inuse);
  const streamStatus = useMemoryStore((s) => s.streamStatus);

  return {
    inuse,
    streamStatus,
    startStream: startMemoryStream,
    stopStream: stopMemoryStream,
  };
}
