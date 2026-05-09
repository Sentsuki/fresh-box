import { create } from "zustand";
import { buildCoreWebSocketUrl } from "../services/coreClient";

interface TrafficState {
  downloadSpeed: number;
  uploadSpeed: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
}

interface TrafficActions {
  setTraffic: (down: number, up: number) => void;
  setStreamStatus: (status: TrafficState["streamStatus"]) => void;
  clear: () => void;
}

export const useTrafficStore = create<TrafficState & TrafficActions>((set) => ({
  downloadSpeed: 0,
  uploadSpeed: 0,
  streamStatus: "disconnected",

  setTraffic: (down, up) => set({ downloadSpeed: down, uploadSpeed: up }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  clear: () => set({ downloadSpeed: 0, uploadSpeed: 0, streamStatus: "disconnected" }),
}));

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let shouldReconnect = false;

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  reconnectTimer = window.setTimeout(() => {
    if (shouldReconnect) connectWs();
  }, 1500);
}

function connectWs() {
  clearReconnectTimer();
  const store = useTrafficStore.getState();
  store.setStreamStatus("connecting");

  ws = new WebSocket(buildCoreWebSocketUrl("traffic"));

  ws.onopen = () => {
    store.setStreamStatus("connected");
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as { down: number; up: number };
      store.setTraffic(data.down, data.up);
    } catch {
      // ignore parse errors
    }
  };

  ws.onerror = () => {
    store.setStreamStatus("error");
  };

  ws.onclose = () => {
    ws = null;
    if (shouldReconnect) {
      store.setStreamStatus("connecting");
      scheduleReconnect();
    } else {
      store.setStreamStatus("disconnected");
    }
  };
}

export function startTrafficStream() {
  if (shouldReconnect) return;
  shouldReconnect = true;
  connectWs();
}

export function stopTrafficStream(clear = false) {
  shouldReconnect = false;
  clearReconnectTimer();
  if (ws) {
    const activeWs = ws;
    ws = null;
    activeWs.close();
  } else {
    useTrafficStore.getState().setStreamStatus("disconnected");
  }
  if (clear) {
    useTrafficStore.getState().clear();
  }
}

export function useTrafficStream() {
  const downloadSpeed = useTrafficStore((s) => s.downloadSpeed);
  const uploadSpeed = useTrafficStore((s) => s.uploadSpeed);
  const streamStatus = useTrafficStore((s) => s.streamStatus);

  return {
    downloadSpeed,
    uploadSpeed,
    streamStatus,
    startStream: startTrafficStream,
    stopStream: stopTrafficStream,
  };
}
