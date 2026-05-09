import { create } from "zustand";
import { buildCoreWebSocketUrl } from "../services/coreClient";

interface MemoryState {
  memoryInUse: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
}

interface MemoryActions {
  setMemory: (inuse: number) => void;
  setStreamStatus: (status: MemoryState["streamStatus"]) => void;
  clear: () => void;
}

export const useMemoryStore = create<MemoryState & MemoryActions>((set) => ({
  memoryInUse: 0,
  streamStatus: "disconnected",

  setMemory: (inuse) => set({ memoryInUse: inuse }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  clear: () => set({ memoryInUse: 0, streamStatus: "disconnected" }),
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
      store.setMemory(data.inuse);
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
  const memoryInUse = useMemoryStore((s) => s.memoryInUse);
  const streamStatus = useMemoryStore((s) => s.streamStatus);

  return {
    memoryInUse,
    streamStatus,
    startStream: startMemoryStream,
    stopStream: stopMemoryStream,
  };
}
