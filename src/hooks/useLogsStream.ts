import { useCallback, useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { CoreLogMessage, LogEntry, LogLevel } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";
import { invokeCommand } from "../services/tauri";

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
  // Buffer lives in the store so it's co-located with the state it feeds.
  // Using a plain array (not reactive) avoids triggering renders on every push.
  _buffer: LogEntry[];
  _seq: number;
  search: string;
  isPaused: boolean;
  streamStatus:
    | "disconnected"
    | "connecting"
    | "connected"
    | "error"
    | "disabled";
  streamError: string | null;
  setSearch: (s: string) => void;
  setIsPaused: (p: boolean) => void;
  setStreamStatus: (
    s: "disconnected" | "connecting" | "connected" | "error" | "disabled",
  ) => void;
  setStreamError: (e: string | null) => void;
  pushEntry: (entry: LogEntry) => void;
  flushBuffer: () => void;
  clearLogs: () => void;
}

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  _buffer: [],
  _seq: 1,
  search: "",
  isPaused: false,
  streamStatus: "disconnected",
  streamError: null,
  setSearch: (search) => set({ search }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  setStreamError: (streamError) => set({ streamError }),

  pushEntry: (entry) => {
    // Mutate the buffer array directly — no re-render triggered here.
    get()._buffer.push(entry);
  },

  flushBuffer: () => {
    const buffer = get()._buffer;
    if (buffer.length === 0) return;
    const batch = buffer.splice(0);
    set((state) => {
      const next = [...state.logs, ...batch];
      return { logs: next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next };
    });
  },

  clearLogs: () => set({ logs: [], _buffer: [], _seq: 1, streamStatus: "disconnected", isPaused: false }),
}));

function extractCategory(payload: string): string {
  if (!payload.trim()) return "general";
  const bracketMatch = payload.match(/^\[(.+?)\]/);
  if (bracketMatch) return bracketMatch[1];
  const colonIndex = payload.indexOf(":");
  if (colonIndex > 0) return payload.slice(0, colonIndex).trim();
  return payload.split(/\s+/)[0];
}

// ---------------------------------------------------------------------------
// Module-level stream management — mirrors the pattern used by
// useTrafficStream and useConnectionsStream for consistency.
// ---------------------------------------------------------------------------

let isStreaming = false;

// Register event listeners once at module load, always active.
void listen<CoreLogMessage>("stream-logs", (e) => {
  if (!isStreaming) return; // guard: ignore events after stream is stopped
  const store = useLogsStore.getState();
  if (store.isPaused) return;
  const msg = e.payload;
  const seq = store._seq;
  // Increment seq in the store without triggering a render.
  useLogsStore.setState((s) => ({ _seq: s._seq + 1 }));
  const entry: LogEntry = {
    ...msg,
    seq,
    time: new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    category: extractCategory(msg.payload),
  };
  store.pushEntry(entry);
});

void listen<string>("stream-logs-status", (e) => {
  const status = e.payload as LogsState["streamStatus"];
  useLogsStore.getState().setStreamStatus(status);
  useLogsStore.getState().setStreamError(null);
  if (status === "disabled" || status === "error") {
    isStreaming = false;
  }
});

export async function startLogsStream() {
  if (isStreaming) return;
  isStreaming = true;
  await invokeCommand<void>("start_logs_stream");
}

export async function stopLogsStream(clear = false) {
  isStreaming = false;
  await invokeCommand<void>("stop_logs_stream");
  if (clear) {
    useLogsStore.getState().clearLogs();
  } else {
    useLogsStore.getState().setStreamStatus("disconnected");
  }
}

export async function restartLogsStream() {
  if (!isStreaming) return;
  await invokeCommand<void>("stop_logs_stream");
  await invokeCommand<void>("start_logs_stream");
}

// --- Hook for React components ---

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
  const flushBuffer = useLogsStore((s) => s.flushBuffer);

  const logLevel = useSettingsStore((s) => s.settings.logs.log_level);
  const typeFilter = useSettingsStore((s) => s.settings.logs.type_filter);
  const setLogLevel = useSettingsStore((s) => s.setLogLevel);
  const setLogTypeFilter = useSettingsStore((s) => s.setLogTypeFilter);

  const { success, info } = useToast();

  // Flush the buffer into reactive state every 100 ms.
  useEffect(() => {
    const timerId = setInterval(flushBuffer, 100);
    return () => clearInterval(timerId);
  }, [flushBuffer]);

  const visibleLogs = useMemo(
    () =>
      logs
        .filter((entry) => {
          if (
            typeFilter &&
            entry.category !== typeFilter &&
            entry.type !== typeFilter
          ) {
            return false;
          }
          return matchesSearch(entry, search);
        })
        .reverse(),
    [logs, search, typeFilter],
  );

  const availableTypes = useMemo(
    () =>
      [...new Set(logs.map((e) => e.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [logs],
  );

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
    startStream: () => void startLogsStream(),
    stopStream: (clear = false) => void stopLogsStream(clear),
    restartStream: () => void restartLogsStream(),
    clearLogs,
    downloadLogs,
  };
}
