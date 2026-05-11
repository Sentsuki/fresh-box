import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  startTrafficStream as startTrafficStreamCmd,
  stopTrafficStream as stopTrafficStreamCmd,
} from "../services/api";

export interface DataPoint {
  dl: number;
  ul: number;
  tick: number;
}

const MAX_POINTS = 60;

interface TrafficState {
  downloadSpeed: number;
  uploadSpeed: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  history: DataPoint[];
}

interface TrafficActions {
  setTraffic: (down: number, up: number) => void;
  setStreamStatus: (status: TrafficState["streamStatus"]) => void;
  clear: () => void;
}

// Pre-fill history with zeros so the chart is full from the start
const generateInitialHistory = (): DataPoint[] => {
  const arr: DataPoint[] = [];
  const now = Date.now();
  for (let i = 0; i < MAX_POINTS; i++) {
    arr.push({ dl: 0, ul: 0, tick: now - (MAX_POINTS - i) * 1000 });
  }
  return arr;
};

export const useTrafficStore = create<TrafficState & TrafficActions>((set) => ({
  downloadSpeed: 0,
  uploadSpeed: 0,
  streamStatus: "disconnected",
  history: generateInitialHistory(),

  setTraffic: (down, up) =>
    set((state) => {
      const nextHistory = [
        ...state.history,
        { dl: down, ul: up, tick: Date.now() },
      ];
      return {
        downloadSpeed: down,
        uploadSpeed: up,
        history:
          nextHistory.length > MAX_POINTS
            ? nextHistory.slice(nextHistory.length - MAX_POINTS)
            : nextHistory,
      };
    }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  clear: () =>
    set({
      downloadSpeed: 0,
      uploadSpeed: 0,
      streamStatus: "disconnected",
      history: generateInitialHistory(),
    }),
}));

export function startTrafficStream() {
  void startTrafficStreamCmd();
}

export function stopTrafficStream(clear = false) {
  void stopTrafficStreamCmd();
  if (clear) {
    useTrafficStore.getState().clear();
  }
}

export function useTrafficStream() {
  const downloadSpeed = useTrafficStore((s) => s.downloadSpeed);
  const uploadSpeed = useTrafficStore((s) => s.uploadSpeed);
  const streamStatus = useTrafficStore((s) => s.streamStatus);
  const history = useTrafficStore((s) => s.history);

  useEffect(() => {
    const unlistenStatus = listen<string>("stream-traffic-status", (e) => {
      useTrafficStore
        .getState()
        .setStreamStatus(e.payload as TrafficState["streamStatus"]);
    });

    const unlistenData = listen<{ down: number; up: number }>(
      "stream-traffic",
      (e) => {
        useTrafficStore
          .getState()
          .setTraffic(e.payload.down, e.payload.up);
      },
    );

    return () => {
      void unlistenStatus.then((fn) => fn());
      void unlistenData.then((fn) => fn());
    };
  }, []);

  return {
    downloadSpeed,
    uploadSpeed,
    streamStatus,
    history,
    startStream: startTrafficStream,
    stopStream: stopTrafficStream,
  };
}
