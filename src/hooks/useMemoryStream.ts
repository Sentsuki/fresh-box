import { create } from "zustand";
import { buildCoreWebSocketUrl } from "../services/coreClient";

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
  const store = useMemoryStore.getState();
  store.setStreamStatus("connecting");

  ws = new WebSocket(buildCoreWebSocketUrl("memory"));

  ws.onopen = () => {
    store.setStreamStatus("connected");
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as { inuse: number };
      // Skip zero values (core not yet reporting)
      if (data.inuse > 0) {
        store.setInuse(data.inuse);
      }
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

export function startMemoryStream() {
  if (shouldReconnect) return;
  shouldReconnect = true;
  connectWs();
}

export function stopMemoryStream(clear = false) {
  shouldReconnect = false;
  clearReconnectTimer();
  if (ws) {
    const activeWs = ws;
    ws = null;
    activeWs.close();
  } else {
    useMemoryStore.getState().setStreamStatus("disconnected");
  }
  if (clear) {
    useMemoryStore.getState().clear();
  }
}

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
