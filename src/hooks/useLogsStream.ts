import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import { buildCoreWebSocketUrl } from "../services/coreClient";
import type { CoreLogMessage, LogEntry, LogLevel } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";

const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
] as const;

const LOG_LIMIT = 2000;

interface LogsState {
  logs: LogEntry[];
  search: string;
  isPaused: boolean;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  streamError: string | null;
  setSearch: (s: string) => void;
  setIsPaused: (p: boolean) => void;
  setStreamStatus: (
    s: "disconnected" | "connecting" | "connected" | "error",
  ) => void;
  setStreamError: (e: string | null) => void;
  clearLogs: () => void;
}

let logSeq = 1;
const logBuffer: LogEntry[] = [];

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  search: "",
  isPaused: false,
  streamStatus: "disconnected",
  streamError: null,
  setSearch: (search) => set({ search }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  setStreamError: (streamError) => set({ streamError }),
  clearLogs: () => {
    logSeq = 1;
    logBuffer.length = 0;
    set({ logs: [] });
  },
}));

function extractCategory(payload: string): string {
  if (!payload.trim()) return "general";
  const bracketMatch = payload.match(/^\[(.+?)\]/);
  if (bracketMatch) return bracketMatch[1];
  const colonIndex = payload.indexOf(":");
  if (colonIndex > 0) return payload.slice(0, colonIndex).trim();
  return payload.split(/\s+/)[0];
}

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
    if (shouldReconnect) connect();
  }, 1500);
}

function connect() {
  clearReconnectTimer();
  const store = useLogsStore.getState();
  const logLevel =
    useSettingsStore.getState().settings.pages.logs.log_level;

  store.setStreamStatus("connecting");
  store.setStreamError(null);

  socket = new WebSocket(
    buildCoreWebSocketUrl("logs", { level: logLevel }),
  );

  socket.onopen = () => {
    store.setStreamStatus("connected");
    store.setStreamError(null);
  };

  socket.onmessage = (event) => {
    try {
      if (useLogsStore.getState().isPaused) {
        logSeq += 1;
        return;
      }
      const msg = JSON.parse(event.data as string) as CoreLogMessage;
      const entry: LogEntry = {
        ...msg,
        seq: logSeq++,
        time: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
        category: extractCategory(msg.payload),
      };
      // Buffer the entry — flushed via rAF in useLogsStream hook
      logBuffer.push(entry);
    } catch {
      // ignore parse errors
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

function matchesSearch(entry: LogEntry, filter: string): boolean {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack =
    `${entry.time} ${entry.type} ${entry.category} ${entry.payload}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function useLogsStream() {
  const logs = useLogsStore((s) => s.logs);
  const search = useLogsStore((s) => s.search);
  const isPaused = useLogsStore((s) => s.isPaused);
  const streamStatus = useLogsStore((s) => s.streamStatus);
  const streamError = useLogsStore((s) => s.streamError);
  const setSearch = useLogsStore((s) => s.setSearch);
  const setIsPaused = useLogsStore((s) => s.setIsPaused);
  const clearLogsState = useLogsStore((s) => s.clearLogs);

  const logLevel = useSettingsStore(
    (s) => s.settings.pages.logs.log_level,
  );
  const typeFilter = useSettingsStore(
    (s) => s.settings.pages.logs.type_filter,
  );
  const setLogLevel = useSettingsStore((s) => s.setLogLevel);
  const setLogTypeFilter = useSettingsStore((s) => s.setLogTypeFilter);

  const { success, info } = useToast();

  // Flush logBuffer into store every 100ms; skip when app is hidden (minimized/unfocused)
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const flush = () => {
      if (!document.hidden && logBuffer.length > 0) {
        const batch = logBuffer.splice(0);
        useLogsStore.setState((state) => {
          const next = [...state.logs, ...batch];
          return { logs: next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next };
        });
      }
      timerId = setTimeout(flush, 100);
    };
    timerId = setTimeout(flush, 100);
    return () => clearTimeout(timerId);
  }, []);

  const visibleLogs = useMemo(
    () =>
      logs.filter((entry) => {
        if (
          typeFilter &&
          entry.category !== typeFilter &&
          entry.type !== typeFilter
        ) {
          return false;
        }
        return matchesSearch(entry, search);
      }),
    [logs, search, typeFilter],
  );

  const availableTypes = useMemo(
    () =>
      [...new Set(logs.map((e) => e.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [logs],
  );

  const startStream = useCallback(() => {
    if (shouldReconnect) return;
    shouldReconnect = true;
    connect();
  }, []);

  const stopStream = useCallback(
    (clear = false) => {
      shouldReconnect = false;
      clearReconnectTimer();
      if (socket) {
        const s = socket;
        socket = null;
        s.close();
      } else {
        useLogsStore.getState().setStreamStatus("disconnected");
      }
      if (clear) clearLogsState();
    },
    [clearLogsState],
  );

  const restartStream = useCallback(() => {
    if (!shouldReconnect) return;
    stopStream(false);
    shouldReconnect = true;
    connect();
  }, [stopStream]);

  const clearLogs = useCallback(() => {
    clearLogsState();
    success("Logs cleared");
  }, [clearLogsState, success]);

  const downloadLogs = useCallback(() => {
    if (logs.length === 0) {
      info("No logs to export");
      return;
    }
    const blob = new Blob(
      [
        logs
          .slice()
          .reverse()
          .map(
            (e) =>
              `${String(e.seq).padStart(5, "0")}\t${e.time}\t${e.type}\t${e.category}\t${e.payload}`,
          )
          .join("\n"),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${new Date().toISOString().replace(/[:]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }, [logs, info]);

  return {
    logs,
    visibleLogs,
    search,
    setSearch,
    typeFilter,
    setTypeFilter: setLogTypeFilter,
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
    clearLogs,
    downloadLogs,
  };
}
