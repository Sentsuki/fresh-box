import { create } from "zustand";
import {
  startStatusStream,
  stopStatusStream,
} from "../daemon/statusStream";

export interface DataPoint {
  dl: number;
  ul: number;
  tick: number;
}

const MAX_POINTS = 60;

interface TrafficState {
  downloadSpeed: number;
  uploadSpeed: number;
  /** 会话累计流量，来自 `Status.downlinkTotal`/`uplinkTotal` —— daemon 自己
   * 维护的真实累计值，单调不减。以前 Rust 用「对活跃连接求和」顶替它，连接
   * 一关总量就往回掉（审计项 M-07）。 */
  downloadTotal: number;
  uploadTotal: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  history: DataPoint[];
}

interface TrafficActions {
  setTraffic: (down: number, up: number) => void;
  setTotals: (downTotal: number, upTotal: number) => void;
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
  downloadTotal: 0,
  uploadTotal: 0,
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
  setTotals: (downloadTotal, uploadTotal) => set({ downloadTotal, uploadTotal }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  clear: () =>
    set({
      downloadSpeed: 0,
      uploadSpeed: 0,
      downloadTotal: 0,
      uploadTotal: 0,
      streamStatus: "disconnected",
      history: generateInitialHistory(),
    }),
}));

// 流量与内存来自同一条 `SubscribeStatus`（见 `daemon/statusStream.ts`），
// 所以这里的启停就是那一条流的启停 —— 两个 store 一起动。
export const startTrafficStream = startStatusStream;
export const stopTrafficStream = stopStatusStream;

export function useTrafficStream() {
  const downloadSpeed = useTrafficStore((s) => s.downloadSpeed);
  const uploadSpeed = useTrafficStore((s) => s.uploadSpeed);
  const streamStatus = useTrafficStore((s) => s.streamStatus);
  const history = useTrafficStore((s) => s.history);

  return {
    downloadSpeed,
    uploadSpeed,
    streamStatus,
    history,
    startStream: startTrafficStream,
    stopStream: stopTrafficStream,
  };
}
