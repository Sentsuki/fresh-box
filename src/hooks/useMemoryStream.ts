import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  startMemoryStream as startMemoryStreamCmd,
  stopMemoryStream as stopMemoryStreamCmd,
} from "../services/api";

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

export function startMemoryStream() {
  void startMemoryStreamCmd();
}

export function stopMemoryStream(clear = false) {
  void stopMemoryStreamCmd();
  if (clear) {
    useMemoryStore.getState().clear();
  }
}

export function useMemoryStream() {
  const inuse = useMemoryStore((s) => s.inuse);
  const streamStatus = useMemoryStore((s) => s.streamStatus);

  useEffect(() => {
    const unlistenStatus = listen<string>("stream-memory-status", (e) => {
      useMemoryStore
        .getState()
        .setStreamStatus(e.payload as MemoryState["streamStatus"]);
    });

    const unlistenData = listen<{ inuse: number }>("stream-memory", (e) => {
      if (e.payload.inuse > 0) {
        useMemoryStore.getState().setInuse(e.payload.inuse);
      }
    });

    return () => {
      void unlistenStatus.then((fn) => fn());
      void unlistenData.then((fn) => fn());
    };
  }, []);

  return {
    inuse,
    streamStatus,
    startStream: startMemoryStream,
    stopStream: stopMemoryStream,
  };
}
