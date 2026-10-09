import { create } from "zustand";

interface DataPoint {
  /** 平滑后的值，见 `SMOOTHING_ALPHA`。 */
  dl: number;
  ul: number;
  tick: number;
}

const MAX_POINTS = 60;

/**
 * 历史曲线的指数平均系数。daemon 给的是「这一秒过了多少字节」的原始差值，
 * 相邻两秒差 10%～30% 很正常（TCP 锯齿、限速周期、视频分片拉流），原样画
 * 出来流量一大就是一串小山包。只平滑画图用的 `history`，顶部的实时速度
 * 仍然是原始值。0.3 大约是「最近 3 秒占三分之二权重」，跟手但不抖。
 */
const SMOOTHING_ALPHA = 0.3;

const ema = (prev: number, next: number) =>
  prev + SMOOTHING_ALPHA * (next - prev);

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
      const last = state.history[state.history.length - 1];
      const nextHistory = [
        ...state.history,
        {
          dl: last ? ema(last.dl, down) : down,
          ul: last ? ema(last.ul, up) : up,
          tick: Date.now(),
        },
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
  setTotals: (downloadTotal, uploadTotal) =>
    set({ downloadTotal, uploadTotal }),
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
