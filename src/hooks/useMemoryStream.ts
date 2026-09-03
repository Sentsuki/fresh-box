import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  startMemoryStream as startMemoryStreamCmd,
  stopMemoryStream as stopMemoryStreamCmd,
} from "../services/api";
import { createStreamGuard } from "./streamGuard";

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

const guard = createStreamGuard({
  start: startMemoryStreamCmd,
  stop: stopMemoryStreamCmd,
});

export function startMemoryStream() {
  void guard.start();
}

export function stopMemoryStream(clear = false) {
  void guard.stop(clear ? () => useMemoryStore.getState().clear() : undefined);
}

// Register event listeners at module level so they're always active.
void listen<string>("stream-memory-status", (e) => {
  useMemoryStore
    .getState()
    .setStreamStatus(e.payload as MemoryState["streamStatus"]);
});

void listen<{ inuse: number }>("stream-memory", (e) => {
  if (!guard.isActive()) return;
  // Treat a reported `0` as "not a real sample yet" rather than genuine
  // usage — sing-box's memory reading can come back 0 for the first tick
  // or two right after the stream (re)connects, and showing that in the UI
  // would read as "0 B used" rather than "no data yet". (Unverified against
  // the daemon's actual behavior whether 0 can ever be legitimate; treating
  // it as a sentinel is harmless either way since real usage is never
  // exactly zero.)
  if (e.payload.inuse > 0) {
    useMemoryStore.getState().setInuse(e.payload.inuse);
  }
});

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
