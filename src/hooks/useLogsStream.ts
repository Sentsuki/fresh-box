import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import type { LogEntry } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";
import { loadPriorityConfig } from "../services/api";
import { startedService } from "../daemon/clients";
import { createStreamController } from "../daemon/subscription";
import { LogLevel } from "../gen/daemon/started_service_pb";
import { extractCategory, stripAnsiCodes } from "./logFormat";

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
    "disconnected" | "connecting" | "connected" | "error" | "disabled";
  setSearch: (s: string) => void;
  setIsPaused: (p: boolean) => void;
  setStreamStatus: (
    s: "disconnected" | "connecting" | "connected" | "error" | "disabled",
  ) => void;
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
  setSearch: (search) => set({ search }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),

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

  clearLogs: () => set({ logs: [], _buffer: [], _seq: 1, isPaused: false }),
}));

/** proto 的 `LogLevel` 枚举 → 页面一直在用的那套字符串。 */
const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.PANIC]: "panic",
  [LogLevel.FATAL]: "fatal",
  [LogLevel.ERROR]: "error",
  [LogLevel.WARN]: "warning",
  [LogLevel.INFO]: "info",
  [LogLevel.DEBUG]: "debug",
  [LogLevel.TRACE]: "trace",
};

function appendEntry(level: LogLevel, message: string) {
  const store = useLogsStore.getState();
  if (store.isPaused) return;
  const seq = store._seq;
  // 只改 _seq，不触发渲染。
  useLogsStore.setState((s) => ({ _seq: s._seq + 1 }));
  const payload = stripAnsiCodes(message);
  store.pushEntry({
    type: LEVEL_NAMES[level] ?? "info",
    payload,
    seq,
    time: new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    category: extractCategory(payload),
  });
}

const controller = createStreamController({
  subscribe: (signal) => startedService.subscribeLog({}, { signal }),
  onMessage: (log) => {
    for (const message of log.messages) {
      appendEntry(message.level, message.message);
    }
  },
  onStatus: (status) => {
    // `disabled` 是配置状态，不该被流的生命周期覆盖掉 —— 它一直挂到用户改配置
    // 为止（页面据此显示「日志在核心配置里被关闭」而不是「未连接」）。
    if (useLogsStore.getState().streamStatus === "disabled") return;
    useLogsStore.getState().setStreamStatus(status);
  },
});

export async function startLogsStream() {
  // 日志是否输出由 fresh-box 自己的 priority config 决定（host 域的设置），
  // 关掉时 daemon 那条流会一直是空的，订阅它没有意义也没法给用户解释。
  // 以前这个判断在 Rust 的 `start_logs_stream` 里，现在归调用方 —— 前端本来
  // 就有读这份配置的命令。
  try {
    const priority = await loadPriorityConfig();
    if (priority.log.disabled) {
      useLogsStore.getState().setStreamStatus("disabled");
      return;
    }
  } catch {
    // 读不到就当没禁用，照常订阅 —— 顶多是空流，比因为读配置失败而看不到日志好。
  }
  if (useLogsStore.getState().streamStatus === "disabled") {
    useLogsStore.getState().setStreamStatus("disconnected");
  }
  controller.start();
}

export async function stopLogsStream(clear = false) {
  controller.stop(
    clear ? () => useLogsStore.getState().clearLogs() : undefined,
  );
  if (useLogsStore.getState().streamStatus !== "disabled") {
    useLogsStore.getState().setStreamStatus("disconnected");
  }
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
  const setSearch = useLogsStore((s) => s.setSearch);
  const setIsPaused = useLogsStore((s) => s.setIsPaused);
  const clearLogsState = useLogsStore((s) => s.clearLogs);
  const flushBuffer = useLogsStore((s) => s.flushBuffer);

  const typeFilter = useSettingsStore((s) => s.settings.logs.type_filter);
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
    isPaused,
    setIsPaused,
    streamStatus,
    availableTypes,
    startStream: () => void startLogsStream(),
    stopStream: (clear = false) => void stopLogsStream(clear),
    clearLogs,
    downloadLogs,
  };
}
