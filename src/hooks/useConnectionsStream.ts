import { useMemo } from "react";
import { create } from 'zustand';
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

interface ConnectionsState {
  activeConnections: ConnectionEntry[];
  closedConnections: ConnectionEntry[];
  totalDownload: number;
  totalUpload: number;
  isPaused: boolean;
  search: string;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  streamError: string | null;
  selectedConnection: ConnectionEntry | null;
  detailsOpen: boolean;
  activeDisconnectIds: string[];
  isDisconnectingAll: boolean;

  setSearch: (search: string) => void;
  setIsPaused: (paused: boolean) => void;
  setStreamStatus: (status: "disconnected" | "connecting" | "connected" | "error") => void;
  setStreamError: (error: string | null) => void;
  setSelectedConnection: (conn: ConnectionEntry | null) => void;
  setDetailsOpen: (open: boolean) => void;
  setActiveDisconnectIds: (ids: string[]) => void;
  setIsDisconnectingAll: (disconnecting: boolean) => void;

  applyFrame: (frame: CoreConnectionsFrame) => void;
  resetConnectionState: () => void;
  clearClosedConnections: () => void;
}

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

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  activeConnections: [],
  closedConnections: [],
  totalDownload: 0,
  totalUpload: 0,
  isPaused: false,
  search: "",
  streamStatus: "disconnected",
  streamError: null,
  selectedConnection: null,
  detailsOpen: false,
  activeDisconnectIds: [],
  isDisconnectingAll: false,

  setSearch: (search) => set({ search }),
  setIsPaused: (paused) => set({ isPaused: paused }),
  setStreamStatus: (status) => set({ streamStatus: status }),
  setStreamError: (error) => set({ streamError: error }),
  setSelectedConnection: (conn) => set({ selectedConnection: conn }),
  setDetailsOpen: (open) => set({ detailsOpen: open }),
  setActiveDisconnectIds: (ids) => set({ activeDisconnectIds: ids }),
  setIsDisconnectingAll: (disconnecting) => set({ isDisconnectingAll: disconnecting }),

  applyFrame: (frame) => {
    if (get().isPaused) {
      set({ totalDownload: frame.downloadTotal, totalUpload: frame.uploadTotal });
      return;
    }

    const currentConnectionsMap = new Map<string, CoreConnectionSnapshot>();
    const previousSnapshot = new Map(previousConnectionsMap);

    const newActiveConnections = (frame.connections ?? []).map((connection) => {
      const previous = previousSnapshot.get(connection.id);
      previousSnapshot.delete(connection.id);
      currentConnectionsMap.set(connection.id, connection);
      return normalizeConnection(connection, previous);
    });

    const newlyClosed = Array.from(previousSnapshot.values())
      .map((connection) => normalizeConnection(connection))
      .sort((left, right) => right.start.localeCompare(left.start));

    previousConnectionsMap = currentConnectionsMap;

    set((state) => ({
      totalDownload: frame.downloadTotal,
      totalUpload: frame.uploadTotal,
      activeConnections: newActiveConnections,
      closedConnections: newlyClosed.length > 0 
        ? [...newlyClosed, ...state.closedConnections].slice(0, 500) 
        : state.closedConnections
    }));
  },

  resetConnectionState: () => {
    previousConnectionsMap.clear();
    set({
      activeConnections: [],
      closedConnections: [],
      totalDownload: 0,
      totalUpload: 0,
      selectedConnection: null,
      detailsOpen: false
    });
  },

  clearClosedConnections: () => {
    set({ closedConnections: [] });
    toast.success("Closed connection history cleared");
  }
}));

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

function connect() {
  clearReconnectTimer();
  const store = useConnectionsStore.getState();
  store.setStreamStatus("connecting");
  store.setStreamError(null);

  socket = new WebSocket(buildCoreWebSocketUrl("connections"));

  socket.onopen = () => {
    store.setStreamStatus("connected");
    store.setStreamError(null);
  };

  socket.onmessage = (event) => {
    try {
      store.applyFrame(JSON.parse(event.data as string) as CoreConnectionsFrame);
    } catch (error) {
      store.setStreamStatus("error");
      store.setStreamError(
        error instanceof Error ? error.message : "Failed to parse connections frame"
      );
    }
  };

  socket.onerror = () => {
    store.setStreamStatus("error");
    store.setStreamError("Connections stream failed.");
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
  const store = useConnectionsStore();
  const appStore = useAppStore();
  
  const connectionSettings = appStore.appSettings.pages.connections;

  function updateConnectionSettings(updater: (settings: ConnectionPageSettings) => void) {
    void appStore.updatePageSettings("connections", updater);
  }

  const currentTab = connectionSettings.current_tab;
  const setCurrentTab = (value: ConnectionPageTab) => {
    updateConnectionSettings((settings) => {
      settings.current_tab = value;
    });
  };

  const columnOrder = connectionSettings.column_order;
  const visibleColumnKeys = connectionSettings.visible_columns;
  const sortKey = connectionSettings.sort_key;
  const sortDirection = connectionSettings.sort_direction;
  const groupedColumnKey = connectionSettings.grouped_column;
  const collapsedGroups = connectionSettings.collapsed_groups;

  const orderedColumnOptions = useMemo(() =>
    columnOrder.map((key) => columnDefinitions[key]),
    [columnOrder]
  );

  const visibleColumns = useMemo(() =>
    orderedColumnOptions.filter((column) =>
      visibleColumnKeys.includes(column.key),
    ),
    [orderedColumnOptions, visibleColumnKeys]
  );

  const filteredConnections = useMemo(() => {
    const source =
      currentTab === "active"
        ? store.activeConnections
        : store.closedConnections;

    return source.filter((connection) => matchesSearch(connection, store.search));
  }, [currentTab, store.activeConnections, store.closedConnections, store.search]);

  const visibleConnections = useMemo(() =>
    sortConnections(filteredConnections, sortKey, sortDirection),
    [filteredConnections, sortKey, sortDirection]
  );

  const groupedColumn = useMemo(() =>
    groupedColumnKey ? columnDefinitions[groupedColumnKey] : null,
    [groupedColumnKey]
  );

  const groupedVisibleConnections = useMemo<ConnectionGroup[]>(() => {
    const activeGroupedColumn = groupedColumn;

    if (!activeGroupedColumn) {
      return [];
    }

    const groups = new Map<
      string,
      { id: string; label: string; rawValue: ColumnValue; items: ConnectionEntry[] }
    >();

    for (const connection of filteredConnections) {
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
      sortKey === activeGroupedColumn.key ? sortDirection : "asc";

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
        items: sortConnections(group.items, sortKey, sortDirection),
      }));
  }, [groupedColumn, filteredConnections, sortKey, sortDirection]);

  const activeCount = store.activeConnections.length;
  const closedCount = store.closedConnections.length;

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
      store.setStreamStatus("disconnected");
    }

    if (clearState) {
      store.resetConnectionState();
    }
  }

  function openDetails(connection: ConnectionEntry) {
    store.setSelectedConnection(connection);
    store.setDetailsOpen(true);
  }

  function closeDetails() {
    store.setDetailsOpen(false);
    store.setSelectedConnection(null);
  }

  function toggleSort(columnKey: ConnectionColumnKey) {
    if (!columnDefinitions[columnKey].sortable) {
      return;
    }

    if (sortKey !== columnKey) {
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
    return Boolean(collapsedGroups[groupId]);
  }

  function isColumnVisible(columnKey: ConnectionColumnKey) {
    return visibleColumnKeys.includes(columnKey);
  }

  function toggleColumnVisibility(columnKey: ConnectionColumnKey) {
    if (isColumnVisible(columnKey)) {
      if (visibleColumnKeys.length === 1) {
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
    const currentIndex = columnOrder.indexOf(columnKey);
    const targetIndex = currentIndex + direction;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= columnOrder.length) {
      return;
    }

    const nextOrder = [...columnOrder];
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
    if (store.activeDisconnectIds.includes(id)) {
      return;
    }

    store.setActiveDisconnectIds([...store.activeDisconnectIds, id]);
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
      store.setActiveDisconnectIds(store.activeDisconnectIds.filter(
        (value) => value !== id,
      ));
    }
  }

  async function disconnectVisibleConnections() {
    const targets =
      currentTab === "active"
        ? visibleConnections.map((connection) => connection.id)
        : [];

    if (targets.length === 0 || store.isDisconnectingAll) {
      return;
    }

    store.setIsDisconnectingAll(true);
    try {
      if (targets.length === store.activeConnections.length && !store.search.trim()) {
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
      store.setIsDisconnectingAll(false);
    }
  }

  return {
    ...store,
    visibleConnections,
    groupedVisibleConnections,
    visibleColumns,
    orderedColumnOptions,
    currentTab,
    setCurrentTab,
    sortKey,
    sortDirection,
    groupedColumnKey,
    groupedColumn,
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
    formatRelativeDuration,
  };
}
