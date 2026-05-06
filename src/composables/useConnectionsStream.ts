import { computed, readonly, ref } from "vue";
import { coreRequest, buildCoreWebSocketUrl } from "../services/coreClient";
import { formatRelativeDuration } from "../services/utils";
import type {
  ConnectionColumnKey,
  ConnectionEntry,
  ConnectionPageSettings,
  ConnectionPageTab,
  CoreConnectionsFrame,
  CoreConnectionSnapshot,
  SortDirection,
} from "../types/app";
import {
  DEFAULT_CONNECTION_COLUMN_ORDER,
  DEFAULT_CONNECTION_VISIBLE_COLUMNS,
} from "../types/app";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";

type ColumnValue = number | string;

export interface ConnectionColumnOption {
  key: ConnectionColumnKey;
  label: string;
  sortable: boolean;
  groupable: boolean;
  align?: "start" | "end";
}

export interface ConnectionGroup {
  id: string;
  label: string;
  column: ConnectionColumnOption;
  items: ConnectionEntry[];
}

interface ConnectionColumnDefinition extends ConnectionColumnOption {
  defaultDirection: SortDirection;
  getValue: (connection: ConnectionEntry) => ColumnValue;
}

const columnDefinitions: Record<ConnectionColumnKey, ConnectionColumnDefinition> = {
  host: {
    key: "host",
    label: "Host",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) => getConnectionHost(connection),
  },
  destination: {
    key: "destination",
    label: "Destination",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) =>
      `${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`,
  },
  downloadSpeed: {
    key: "downloadSpeed",
    label: "DL Speed",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (connection) => connection.downloadSpeed,
  },
  uploadSpeed: {
    key: "uploadSpeed",
    label: "UL Speed",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (connection) => connection.uploadSpeed,
  },
  download: {
    key: "download",
    label: "Download",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (connection) => connection.download,
  },
  upload: {
    key: "upload",
    label: "Upload",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (connection) => connection.upload,
  },
  chain: {
    key: "chain",
    label: "Chain",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) => getConnectionChain(connection),
  },
  rule: {
    key: "rule",
    label: "Rule",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) => getConnectionRule(connection),
  },
  source: {
    key: "source",
    label: "Source",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) =>
      `${connection.metadata.sourceIP}:${connection.metadata.sourcePort}`,
  },
  process: {
    key: "process",
    label: "Process",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) =>
      connection.metadata.process ||
      connection.metadata.inboundName ||
      connection.metadata.inboundUser ||
      "--",
  },
  network: {
    key: "network",
    label: "Network",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (connection) =>
      `${connection.metadata.network}/${connection.metadata.type}`,
  },
  start: {
    key: "start",
    label: "Time",
    sortable: true,
    groupable: false,
    defaultDirection: "desc",
    getValue: (connection) => new Date(connection.start).getTime(),
  },
};

const activeConnections = ref<ConnectionEntry[]>([]);
const closedConnections = ref<ConnectionEntry[]>([]);
const totalDownload = ref(0);
const totalUpload = ref(0);
const isPaused = ref(false);
const search = ref("");
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

function compareValues(left: ColumnValue, right: ColumnValue) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortConnections(
  items: ConnectionEntry[],
  activeSortKey: ConnectionColumnKey,
  activeSortDirection: SortDirection,
) {
  const definition = columnDefinitions[activeSortKey];

  return [...items].sort((left, right) => {
    const result = compareValues(
      definition.getValue(left),
      definition.getValue(right),
    );

    if (result !== 0) {
      return activeSortDirection === "asc" ? result : -result;
    }

    const fallback = left.id.localeCompare(right.id);
    return activeSortDirection === "asc" ? fallback : -fallback;
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

export function getConnectionRule(connection: ConnectionEntry) {
  if (!connection.rule) {
    return "--";
  }

  return connection.rulePayload
    ? `${connection.rule}: ${connection.rulePayload}`
    : connection.rule;
}

export function useConnectionsStream() {
  const appStore = useAppStore();
  const connectionSettings = computed(() => appStore.appSettings.value.pages.connections);

  function updateConnectionSettings(
    updater: (settings: ConnectionPageSettings) => void,
  ) {
    void appStore.updatePageSettings("connections", updater);
  }

  const currentTab = computed<ConnectionPageTab>({
    get: () => connectionSettings.value.current_tab,
    set: (value) => {
      updateConnectionSettings((settings) => {
        settings.current_tab = value;
      });
    },
  });

  const columnOrder = computed(() => connectionSettings.value.column_order);
  const visibleColumnKeys = computed(
    () => connectionSettings.value.visible_columns,
  );
  const sortKey = computed(() => connectionSettings.value.sort_key);
  const sortDirection = computed(() => connectionSettings.value.sort_direction);
  const groupedColumnKey = computed(
    () => connectionSettings.value.grouped_column,
  );
  const collapsedGroups = computed(
    () => connectionSettings.value.collapsed_groups,
  );

  const orderedColumnOptions = computed(() =>
    columnOrder.value.map((key) => columnDefinitions[key]),
  );

  const visibleColumns = computed(() =>
    orderedColumnOptions.value.filter((column) =>
      visibleColumnKeys.value.includes(column.key),
    ),
  );

  const filteredConnections = computed(() => {
    const source =
      currentTab.value === "active"
        ? activeConnections.value
        : closedConnections.value;

    return source.filter((connection) => matchesSearch(connection, search.value));
  });

  const visibleConnections = computed(() =>
    sortConnections(filteredConnections.value, sortKey.value, sortDirection.value),
  );

  const groupedColumn = computed(() =>
    groupedColumnKey.value ? columnDefinitions[groupedColumnKey.value] : null,
  );

  const groupedVisibleConnections = computed<ConnectionGroup[]>(() => {
    const activeGroupedColumn = groupedColumn.value;

    if (!activeGroupedColumn) {
      return [];
    }

    const groups = new Map<
      string,
      { id: string; label: string; rawValue: ColumnValue; items: ConnectionEntry[] }
    >();

    for (const connection of filteredConnections.value) {
      const rawValue = activeGroupedColumn.getValue(connection);
      const label = String(rawValue || "--");
      const id = `${activeGroupedColumn.key}:${label}`;
      const existing = groups.get(id);

      if (existing) {
        existing.items.push(connection);
        continue;
      }

      groups.set(id, {
        id,
        label,
        rawValue,
        items: [connection],
      });
    }

    const groupDirection =
      sortKey.value === activeGroupedColumn.key ? sortDirection.value : "asc";

    return Array.from(groups.values())
      .sort((left, right) => {
        const result = compareValues(left.rawValue, right.rawValue);
        if (result !== 0) {
          return groupDirection === "asc" ? result : -result;
        }

        return left.id.localeCompare(right.id);
      })
      .map((group) => ({
        id: group.id,
        label: group.label,
        column: activeGroupedColumn,
        items: sortConnections(group.items, sortKey.value, sortDirection.value),
      }));
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

  function toggleSort(columnKey: ConnectionColumnKey) {
    if (!columnDefinitions[columnKey].sortable) {
      return;
    }

    if (sortKey.value !== columnKey) {
      updateConnectionSettings((settings) => {
        settings.sort_key = columnKey;
        settings.sort_direction = columnDefinitions[columnKey].defaultDirection;
      });
      return;
    }

    updateConnectionSettings((settings) => {
      settings.sort_direction =
        settings.sort_direction === "asc" ? "desc" : "asc";
    });
  }

  function toggleGrouping(columnKey: ConnectionColumnKey) {
    if (!columnDefinitions[columnKey].groupable) {
      return;
    }

    updateConnectionSettings((settings) => {
      settings.grouped_column =
        settings.grouped_column === columnKey ? null : columnKey;
      settings.collapsed_groups = {};
    });
  }

  function clearGrouping() {
    updateConnectionSettings((settings) => {
      settings.grouped_column = null;
      settings.collapsed_groups = {};
    });
  }

  function toggleGroupCollapsed(groupId: string) {
    updateConnectionSettings((settings) => {
      settings.collapsed_groups = {
        ...settings.collapsed_groups,
        [groupId]: !settings.collapsed_groups[groupId],
      };
    });
  }

  function isGroupCollapsed(groupId: string) {
    return Boolean(collapsedGroups.value[groupId]);
  }

  function isColumnVisible(columnKey: ConnectionColumnKey) {
    return visibleColumnKeys.value.includes(columnKey);
  }

  function toggleColumnVisibility(columnKey: ConnectionColumnKey) {
    if (isColumnVisible(columnKey)) {
      if (visibleColumnKeys.value.length === 1) {
        return;
      }

      updateConnectionSettings((settings) => {
        settings.visible_columns = settings.visible_columns.filter(
          (value) => value !== columnKey,
        );

        if (settings.grouped_column === columnKey) {
          settings.grouped_column = null;
          settings.collapsed_groups = {};
        }

        if (settings.sort_key === columnKey) {
          const nextSortKey = settings.visible_columns[0];
          if (nextSortKey) {
            settings.sort_key = nextSortKey;
            settings.sort_direction =
              columnDefinitions[nextSortKey].defaultDirection;
          }
        }
      });

      return;
    }

    updateConnectionSettings((settings) => {
      settings.visible_columns = settings.column_order.filter(
        (value) =>
          value === columnKey || settings.visible_columns.includes(value),
      );
    });
  }

  function moveColumn(columnKey: ConnectionColumnKey, direction: -1 | 1) {
    const currentIndex = columnOrder.value.indexOf(columnKey);
    const targetIndex = currentIndex + direction;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= columnOrder.value.length) {
      return;
    }

    const nextOrder = [...columnOrder.value];
    const [movedColumn] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, movedColumn);
    updateConnectionSettings((settings) => {
      settings.column_order = nextOrder;
      settings.visible_columns = nextOrder.filter((value) =>
        settings.visible_columns.includes(value),
      );
    });
  }

  function resetColumnCustomization() {
    updateConnectionSettings((settings) => {
      settings.column_order = [...DEFAULT_CONNECTION_COLUMN_ORDER];
      settings.visible_columns = [...DEFAULT_CONNECTION_VISIBLE_COLUMNS];
      settings.sort_key = "downloadSpeed";
      settings.sort_direction = "desc";
      settings.grouped_column = null;
      settings.collapsed_groups = {};
      settings.current_tab = "active";
    });
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
    groupedVisibleConnections,
    visibleColumns,
    orderedColumnOptions,
    totalDownload: readonly(totalDownload),
    totalUpload: readonly(totalUpload),
    isPaused,
    search,
    currentTab,
    sortKey,
    sortDirection,
    groupedColumnKey,
    groupedColumn,
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
    toggleSort,
    toggleGrouping,
    clearGrouping,
    toggleGroupCollapsed,
    isGroupCollapsed,
    isColumnVisible,
    toggleColumnVisibility,
    moveColumn,
    resetColumnCustomization,
    disconnectConnection,
    disconnectVisibleConnections,
    clearClosedConnections,
    getConnectionHost,
    getConnectionChain,
    getConnectionRule,
    formatRelativeDuration,
  };
}
