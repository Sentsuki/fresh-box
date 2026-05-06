import { create } from 'zustand';
import { buildCoreWebSocketUrl } from "../services/coreClient";
import type { CoreLogMessage, LogEntry, LogLevel } from "../types/app";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";
import { useCallback, useEffect, useMemo } from 'react';

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "panic"] as const;
const LOG_LIMIT = 1000;

interface LogsState {
  logs: LogEntry[];
  search: string;
  isPaused: boolean;
  currentLogLevel: LogLevel;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  streamError: string | null;
  setSearch: (s: string) => void;
  setIsPaused: (p: boolean) => void;
  setCurrentLogLevel: (l: LogLevel) => void;
  setStreamStatus: (s: "disconnected" | "connecting" | "connected" | "error") => void;
  setStreamError: (e: string | null) => void;
  pushLog: (message: CoreLogMessage) => void;
  clearLogs: () => void;
  setLogs: (logs: LogEntry[]) => void;
}

let sequence = 1;

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  search: "",
  isPaused: false,
  currentLogLevel: "info",
  streamStatus: "disconnected",
  streamError: null,
  setSearch: (s) => set({ search: s }),
  setIsPaused: (p) => set({ isPaused: p }),
  setCurrentLogLevel: (l) => set({ currentLogLevel: l }),
  setStreamStatus: (s) => set({ streamStatus: s }),
  setStreamError: (e) => set({ streamError: e }),
  setLogs: (logs) => set({ logs }),
  pushLog: (message) => {
    if (get().isPaused) {
      sequence += 1;
      return;
    }
    const newLog = {
      ...message,
      seq: sequence++,
      time: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      category: extractCategory(message.payload),
    };
    set((state) => ({
      logs: [newLog, ...state.logs].slice(0, LOG_LIMIT)
    }));
  },
  clearLogs: () => {
    sequence = 1;
    set({ logs: [] });
  }
}));

let socket: WebSocket | null = null;
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
    if (shouldReconnect) {
      connect();
    }
  }, 1500);
}

function extractCategory(payload: string) {
  if (!payload.trim()) return "general";
  const bracketMatch = payload.match(/^\[(.+?)\]/);
  if (bracketMatch) return bracketMatch[1];
  const colonIndex = payload.indexOf(":");
  if (colonIndex > 0) return payload.slice(0, colonIndex).trim();
  return payload.split(/\s+/)[0];
}

function connect() {
  clearReconnectTimer();
  const store = useLogsStore.getState();
  store.setStreamStatus("connecting");
  store.setStreamError(null);

  socket = new WebSocket(
    buildCoreWebSocketUrl("logs", {
      level: store.currentLogLevel,
    }),
  );

  socket.onopen = () => {
    store.setStreamStatus("connected");
    store.setStreamError(null);
  };

  socket.onmessage = (event) => {
    try {
      store.pushLog(JSON.parse(event.data as string) as CoreLogMessage);
    } catch (error) {
      store.setStreamStatus("error");
      store.setStreamError(error instanceof Error ? error.message : "Failed to parse log entry");
    }
  };

  socket.onerror = () => {
    store.setStreamStatus("error");
    store.setStreamError("Logs stream failed.");
  };

  socket.onclose = () => {
    socket = null;
    if (shouldReconnect) {
      store.setStreamStatus("connecting");
      scheduleReconnect();
    } else {
      store.setStreamStatus("disconnected");
    }
  };
}

function matchesSearch(entry: LogEntry, filter: string) {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${entry.time} ${entry.type} ${entry.category} ${entry.payload}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function useLogsStream() {
  const logs = useLogsStore((state) => state.logs);
  const search = useLogsStore((state) => state.search);
  const isPaused = useLogsStore((state) => state.isPaused);
  const currentLogLevel = useLogsStore((state) => state.currentLogLevel);
  const streamStatus = useLogsStore((state) => state.streamStatus);
  const streamError = useLogsStore((state) => state.streamError);
  const setSearch = useLogsStore((state) => state.setSearch);
  const setIsPaused = useLogsStore((state) => state.setIsPaused);
  const setCurrentLogLevel = useLogsStore((state) => state.setCurrentLogLevel);
  const setStreamStatus = useLogsStore((state) => state.setStreamStatus);
  const clearLogsState = useLogsStore((state) => state.clearLogs);

  const logLevel = useAppStore((state) => state.appSettings.pages.logs.log_level);
  const typeFilter = useAppStore((state) => state.appSettings.pages.logs.type_filter);
  const updatePageSettings = useAppStore((state) => state.updatePageSettings);

  useEffect(() => {
    if (currentLogLevel !== logLevel) {
      setCurrentLogLevel(logLevel);
    }
  }, [currentLogLevel, logLevel, setCurrentLogLevel]);

  const setLogLevel = useCallback((value: LogLevel) => {
    void updatePageSettings("logs", (settings) => {
      settings.log_level = value;
    });
    setCurrentLogLevel(value);
  }, [setCurrentLogLevel, updatePageSettings]);

  const setTypeFilter = useCallback((value: string) => {
    void updatePageSettings("logs", (settings) => {
      settings.type_filter = value;
    });
  }, [updatePageSettings]);

  const visibleLogs = useMemo(() => 
    logs.filter((entry) => {
      if (typeFilter && entry.category !== typeFilter && entry.type !== typeFilter) {
        return false;
      }
      return matchesSearch(entry, search);
    }),
    [logs, search, typeFilter]
  );

  const availableTypes = useMemo(() =>
    [...new Set(logs.map((entry) => entry.category))].sort((left, right) =>
      left.localeCompare(right),
    ),
    [logs]
  );

  const startStream = useCallback(() => {
    if (shouldReconnect) return;
    shouldReconnect = true;
    connect();
  }, []);

  const stopStream = useCallback((clear = false) => {
    shouldReconnect = false;
    clearReconnectTimer();
    if (socket) {
      const activeSocket = socket;
      socket = null;
      activeSocket.close();
    } else {
      setStreamStatus("disconnected");
    }
    if (clear) {
      clearLogsState();
    }
  }, [clearLogsState, setStreamStatus]);

  const restartStream = useCallback(() => {
    if (!shouldReconnect) return;
    stopStream(false);
    shouldReconnect = true;
    connect();
  }, [stopStream]);

  const clearLogsCmd = useCallback(() => {
    clearLogsState();
    toast.success("Logs cleared");
  }, [clearLogsState]);

  const downloadLogs = useCallback(() => {
    if (logs.length === 0) {
      toast.info("No logs to export");
      return;
    }
    const blob = new Blob(
      [
        logs.slice().reverse().map(
          (entry) => `${entry.seq.toString().padStart(5, "0")}\t${entry.time}\t${entry.type}\t${entry.category}\t${entry.payload}`,
        ).join("\n"),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${new Date().toISOString().replace(/[:]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  return {
    logs,
    visibleLogs,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    logLevel,
    setLogLevel,
    isPaused,
    setIsPaused,
    streamStatus,
    streamError,
    availableTypes,
    logLevels: LOG_LEVELS as readonly LogLevel[],
    startStream,
    stopStream,
    restartStream,
    clearLogs: clearLogsCmd,
    downloadLogs,
  };
}
