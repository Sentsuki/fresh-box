import { computed, readonly, ref } from "vue";
import { coreRequest, buildCoreWebSocketUrl } from "../services/coreClient";
import { formatRelativeDuration } from "../services/utils";
import type {
  ConnectionEntry,
  CoreConnectionsFrame,
  CoreConnectionSnapshot,
} from "../types/app";
import { toast } from "./useToast";

type ConnectionTab = "active" | "closed";
type ConnectionSortKey =
  | "host"
  | "download"
  | "upload"
  | "downloadSpeed"
  | "uploadSpeed"
  | "start";
type SortDirection = "asc" | "desc";

const activeConnections = ref<ConnectionEntry[]>([]);
const closedConnections = ref<ConnectionEntry[]>([]);
const totalDownload = ref(0);
const totalUpload = ref(0);
const isPaused = ref(false);
const search = ref("");
const currentTab = ref<ConnectionTab>("active");
const sortKey = ref<ConnectionSortKey>("downloadSpeed");
const sortDirection = ref<SortDirection>("desc");
const streamStatus = ref<"disconnected" | "connecting" | "connected" | "error">(
  "disconnected",
);
const streamError = ref<string | null>(null);
const selectedConnection = ref<ConnectionEntry | null>(null);
const detailsOpen = ref(false);
const activeDisconnectIds = ref<string[]>([]);
const isDisconnectingAll = ref(false);

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let shouldReconnect = false;
let previousConnectionsMap = new Map<string, CoreConnectionSnapshot>();

function normalizeConnection(
  connection: CoreConnectionSnapshot,
  previous?: CoreConnectionSnapshot,
): ConnectionEntry {
  const network =
    connection.metadata.network === "udp" &&
    (connection.metadata.destinationPort === "443" || connection.metadata.sniffHost)
      ? "quic"
      : connection.metadata.network;

  return {
    ...connection,
    metadata: {
      ...connection.metadata,
      network,
    },
    downloadSpeed: Math.max(0, connection.download - (previous?.download ?? 0)),
    uploadSpeed: Math.max(0, connection.upload - (previous?.upload ?? 0)),
  };
}

function resetConnectionState() {
  activeConnections.value = [];
  closedConnections.value = [];
  totalDownload.value = 0;
  totalUpload.value = 0;
  previousConnectionsMap.clear();
  selectedConnection.value = null;
  detailsOpen.value = false;
}

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

function applyFrame(frame: CoreConnectionsFrame) {
  totalDownload.value = frame.downloadTotal;
  totalUpload.value = frame.uploadTotal;

  if (isPaused.value) {
    return;
  }

  const currentConnectionsMap = new Map<string, CoreConnectionSnapshot>();
  const previousSnapshot = new Map(previousConnectionsMap);

  activeConnections.value = (frame.connections ?? []).map((connection) => {
    const previous = previousSnapshot.get(connection.id);
    previousSnapshot.delete(connection.id);
    currentConnectionsMap.set(connection.id, connection);
    return normalizeConnection(connection, previous);
  });

  const newlyClosed = Array.from(previousSnapshot.values())
    .map((connection) => normalizeConnection(connection))
    .sort((left, right) => right.start.localeCompare(left.start));

  if (newlyClosed.length > 0) {
    closedConnections.value = [...newlyClosed, ...closedConnections.value].slice(0, 500);
  }

  previousConnectionsMap = currentConnectionsMap;
}

function connect() {
  clearReconnectTimer();
  streamStatus.value = "connecting";
  streamError.value = null;

  socket = new WebSocket(buildCoreWebSocketUrl("connections"));

  socket.onopen = () => {
    streamStatus.value = "connected";
    streamError.value = null;
  };

  socket.onmessage = (event) => {
    try {
      applyFrame(JSON.parse(event.data as string) as CoreConnectionsFrame);
    } catch (error) {
      streamStatus.value = "error";
      streamError.value =
        error instanceof Error ? error.message : "Failed to parse connections frame";
    }
  };

  socket.onerror = () => {
    streamStatus.value = "error";
    streamError.value = "Connections stream failed.";
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

function matchesSearch(connection: ConnectionEntry, filter: string) {
  if (!filter.trim()) {
    return true;
  }

  const tokens = filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = [
    connection.metadata.host,
    connection.metadata.destinationIP,
    connection.metadata.destinationPort,
    connection.metadata.sourceIP,
    connection.metadata.sourcePort,
    connection.metadata.sniffHost,
    connection.metadata.inboundName,
    connection.metadata.inboundUser,
    connection.metadata.process,
    connection.metadata.processPath,
    connection.rule,
    connection.rulePayload,
    connection.metadata.network,
    connection.metadata.type,
    connection.chains.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

function sortConnections(items: ConnectionEntry[]) {
  return [...items].sort((left, right) => {
    let result = 0;
    switch (sortKey.value) {
      case "download":
        result = left.download - right.download;
        break;
      case "upload":
        result = left.upload - right.upload;
        break;
      case "downloadSpeed":
        result = left.downloadSpeed - right.downloadSpeed;
        break;
      case "uploadSpeed":
        result = left.uploadSpeed - right.uploadSpeed;
        break;
      case "start":
        result =
          new Date(left.start).getTime() - new Date(right.start).getTime();
        break;
      default:
        result = getConnectionHost(left).localeCompare(getConnectionHost(right));
        break;
    }

    if (result === 0) {
      result = left.id.localeCompare(right.id);
    }

    return sortDirection.value === "asc" ? result : -result;
  });
}

export function getConnectionHost(connection: ConnectionEntry) {
  return (
    connection.metadata.host ||
    connection.metadata.sniffHost ||
    connection.metadata.destinationIP
  );
}

export function getConnectionChain(connection: ConnectionEntry) {
  return connection.chains.length > 0 ? connection.chains.join(" -> ") : "--";
}

export function useConnectionsStream() {
  const visibleConnections = computed(() => {
    const source =
      currentTab.value === "active"
        ? activeConnections.value
        : closedConnections.value;

    return sortConnections(source.filter((connection) => matchesSearch(connection, search.value)));
  });

  const activeCount = computed(() => activeConnections.value.length);
  const closedCount = computed(() => closedConnections.value.length);

  function startStream() {
    if (shouldReconnect) {
      return;
    }

    shouldReconnect = true;
    connect();
  }

  function stopStream(clearState = false) {
    shouldReconnect = false;
    clearReconnectTimer();

    if (socket) {
      const activeSocket = socket;
      socket = null;
      activeSocket.close();
    } else {
      streamStatus.value = "disconnected";
    }

    if (clearState) {
      resetConnectionState();
    }
  }

  function openDetails(connection: ConnectionEntry) {
    selectedConnection.value = connection;
    detailsOpen.value = true;
  }

  function closeDetails() {
    detailsOpen.value = false;
    selectedConnection.value = null;
  }

  async function disconnectConnection(id: string) {
    if (activeDisconnectIds.value.includes(id)) {
      return;
    }

    activeDisconnectIds.value = [...activeDisconnectIds.value, id];
    try {
      await coreRequest<void>(`connections/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      toast.success("Connection closed");
    } catch (error) {
      toast.error(
        `Failed to close connection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      activeDisconnectIds.value = activeDisconnectIds.value.filter(
        (value) => value !== id,
      );
    }
  }

  async function disconnectVisibleConnections() {
    const targets =
      currentTab.value === "active"
        ? visibleConnections.value.map((connection) => connection.id)
        : [];

    if (targets.length === 0 || isDisconnectingAll.value) {
      return;
    }

    isDisconnectingAll.value = true;
    try {
      if (targets.length === activeConnections.value.length && !search.value.trim()) {
        await coreRequest<void>("connections", { method: "DELETE" });
      } else {
        await Promise.all(
          targets.map((id) =>
            coreRequest<void>(`connections/${encodeURIComponent(id)}`, {
              method: "DELETE",
            }),
          ),
        );
      }
      toast.success(`Closed ${targets.length} connection(s)`);
    } catch (error) {
      toast.error(
        `Failed to close connections: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      isDisconnectingAll.value = false;
    }
  }

  function clearClosedConnections() {
    closedConnections.value = [];
    toast.success("Closed connection history cleared");
  }

  return {
    activeConnections: readonly(activeConnections),
    closedConnections: readonly(closedConnections),
    visibleConnections,
    totalDownload: readonly(totalDownload),
    totalUpload: readonly(totalUpload),
    isPaused,
    search,
    currentTab,
    sortKey,
    sortDirection,
    streamStatus: readonly(streamStatus),
    streamError: readonly(streamError),
    selectedConnection: readonly(selectedConnection),
    detailsOpen: readonly(detailsOpen),
    activeDisconnectIds: readonly(activeDisconnectIds),
    isDisconnectingAll: readonly(isDisconnectingAll),
    activeCount,
    closedCount,
    startStream,
    stopStream,
    openDetails,
    closeDetails,
    disconnectConnection,
    disconnectVisibleConnections,
    clearClosedConnections,
    getConnectionHost,
    getConnectionChain,
    formatRelativeDuration,
  };
}
