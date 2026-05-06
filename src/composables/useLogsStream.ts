import { computed, readonly, ref, watch } from "vue";
import { buildCoreWebSocketUrl } from "../services/coreClient";
import type { CoreLogMessage, LogEntry, LogLevel } from "../types/app";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";

const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
] as const;
const LOG_LIMIT = 1000;

const logs = ref<LogEntry[]>([]);
const search = ref("");
const isPaused = ref(false);
const currentLogLevel = ref<LogLevel>("info");
const streamStatus = ref<"disconnected" | "connecting" | "connected" | "error">(
  "disconnected",
);
const streamError = ref<string | null>(null);

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let shouldReconnect = false;
let sequence = 1;

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
  if (!payload.trim()) {
    return "general";
  }

  const bracketMatch = payload.match(/^\[(.+?)\]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  const colonIndex = payload.indexOf(":");
  if (colonIndex > 0) {
    return payload.slice(0, colonIndex).trim();
  }

  return payload.split(/\s+/)[0];
}

function pushLog(message: CoreLogMessage) {
  if (isPaused.value) {
    sequence += 1;
    return;
  }

  logs.value = [
    {
      ...message,
      seq: sequence++,
      time: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      category: extractCategory(message.payload),
    },
    ...logs.value,
  ].slice(0, LOG_LIMIT);
}

function connect() {
  clearReconnectTimer();
  streamStatus.value = "connecting";
  streamError.value = null;

  socket = new WebSocket(
    buildCoreWebSocketUrl("logs", {
      level: currentLogLevel.value,
    }),
  );

  socket.onopen = () => {
    streamStatus.value = "connected";
    streamError.value = null;
  };

  socket.onmessage = (event) => {
    try {
      pushLog(JSON.parse(event.data as string) as CoreLogMessage);
    } catch (error) {
      streamStatus.value = "error";
      streamError.value =
        error instanceof Error ? error.message : "Failed to parse log entry";
    }
  };

  socket.onerror = () => {
    streamStatus.value = "error";
    streamError.value = "Logs stream failed.";
  };

  socket.onclose = () => {
    socket = null;
    if (shouldReconnect) {
      streamStatus.value = "connecting";
      scheduleReconnect();
    } else {
      streamStatus.value = "disconnected";
    }
  };
}

function matchesSearch(entry: LogEntry, filter: string) {
  if (!filter.trim()) {
    return true;
  }

  const tokens = filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = `${entry.time} ${entry.type} ${entry.category} ${entry.payload}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function useLogsStream() {
  const appStore = useAppStore();
  const logLevel = computed<LogLevel>({
    get: () => appStore.appSettings.value.pages.logs.log_level,
    set: (value) => {
      void appStore.updatePageSettings("logs", (settings) => {
        settings.log_level = value;
      });
    },
  });
  const typeFilter = computed<string>({
    get: () => appStore.appSettings.value.pages.logs.type_filter,
    set: (value) => {
      void appStore.updatePageSettings("logs", (settings) => {
        settings.type_filter = value;
      });
    },
  });

  watch(
    logLevel,
    (value) => {
      currentLogLevel.value = value;
    },
    { immediate: true },
  );

  const visibleLogs = computed(() =>
    logs.value.filter((entry) => {
      if (typeFilter.value && entry.category !== typeFilter.value && entry.type !== typeFilter.value) {
        return false;
      }

      return matchesSearch(entry, search.value);
    }),
  );

  const availableTypes = computed(() =>
    [...new Set(logs.value.map((entry) => entry.category))].sort((left, right) =>
      left.localeCompare(right),
    ),
  );

  function startStream() {
    if (shouldReconnect) {
      return;
    }

    shouldReconnect = true;
    connect();
  }

  function stopStream(clearLogs = false) {
    shouldReconnect = false;
    clearReconnectTimer();

    if (socket) {
      const activeSocket = socket;
      socket = null;
      activeSocket.close();
    } else {
      streamStatus.value = "disconnected";
    }

    if (clearLogs) {
      logs.value = [];
      sequence = 1;
    }
  }

  function restartStream() {
    if (!shouldReconnect) {
      return;
    }

    stopStream(false);
    shouldReconnect = true;
    connect();
  }

  function clearLogs() {
    logs.value = [];
    sequence = 1;
    toast.success("Logs cleared");
  }

  function downloadLogs() {
    if (logs.value.length === 0) {
      toast.info("No logs to export");
      return;
    }

    const blob = new Blob(
      [
        logs.value
          .slice()
          .reverse()
          .map(
            (entry) =>
              `${entry.seq.toString().padStart(5, "0")}\t${entry.time}\t${entry.type}\t${entry.category}\t${entry.payload}`,
          )
          .join("\n"),
      ],
      {
        type: "text/plain;charset=utf-8",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${new Date().toISOString().replace(/[:]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return {
    logs: readonly(logs),
    visibleLogs,
    search,
    typeFilter,
    logLevel,
    isPaused,
    streamStatus: readonly(streamStatus),
    streamError: readonly(streamError),
    availableTypes,
    logLevels: LOG_LEVELS as readonly LogLevel[],
    startStream,
    stopStream,
    restartStream,
    clearLogs,
    downloadLogs,
  };
}
