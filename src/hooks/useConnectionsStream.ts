import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { buildCoreWebSocketUrl, coreRequest } from "../services/coreClient";
import { formatRelativeDuration, formatSpeed } from "../services/utils";
import type {
  ConnectionColumnKey,
  ConnectionEntry,
  CoreConnectionsFrame,
  SortDirection,
} from "../types/app";
import { DEFAULT_CONNECTION_COLUMN_ORDER } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";

export interface ConnectionColumnOption {
  key: ConnectionColumnKey;
  label: string;
  sortable: boolean;
  groupable: boolean;
  align?: "start" | "end";
  defaultDirection: SortDirection;
}

export interface ConnectionGroup {
  id: string;
  label: string;
  column: ConnectionColumnOption;
  items: ConnectionEntry[];
}

interface ConnectionColumnDefinition extends ConnectionColumnOption {
  defaultDirection: SortDirection;
  getValue: (c: ConnectionEntry) => number | string;
}

function getConnectionHost(c: ConnectionEntry): string {
  const { host, destinationIP, destinationPort } = c.metadata;
  return host || `${destinationIP}:${destinationPort}`;
}

const columnDefinitions: Record<
  ConnectionColumnKey,
  ConnectionColumnDefinition
> = {
  host: {
    key: "host",
    label: "Host",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: getConnectionHost,
  },
  destination: {
    key: "destination",
    label: "Destination",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) =>
      `${c.metadata.destinationIP}:${c.metadata.destinationPort}`,
  },
  downloadSpeed: {
    key: "downloadSpeed",
    label: "DL Speed",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.downloadSpeed,
  },
  uploadSpeed: {
    key: "uploadSpeed",
    label: "UL Speed",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.uploadSpeed,
  },
  download: {
    key: "download",
    label: "Download",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.download,
  },
  upload: {
    key: "upload",
    label: "Upload",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.upload,
  },
  chain: {
    key: "chain",
    label: "Chain",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.chains.join(" → "),
  },
  rule: {
    key: "rule",
    label: "Rule",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.rule,
  },
  source: {
    key: "source",
    label: "Source",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => `${c.metadata.sourceIP}:${c.metadata.sourcePort}`,
  },
  process: {
    key: "process",
    label: "Process",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.processPath?.split(/[/\\]/).pop() ?? "",
  },
  network: {
    key: "network",
    label: "Network",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.network,
  },
  start: {
    key: "start",
    label: "Duration",
    sortable: true,
    groupable: false,
    defaultDirection: "asc",
    getValue: (c) => c.start,
  },
};

export const allColumns: ConnectionColumnOption[] =
  DEFAULT_CONNECTION_COLUMN_ORDER.map((key) => columnDefinitions[key]);

interface ConnectionsState {
  active: ConnectionEntry[];
  closed: ConnectionEntry[];
  downloadTotal: number;
  uploadTotal: number;
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  isPaused: boolean;
}

interface ConnectionsActions {
  setFrame: (frame: CoreConnectionsFrame) => void;
  addClosed: (entries: ConnectionEntry[]) => void;
  setStreamStatus: (s: ConnectionsState["streamStatus"]) => void;
  setIsPaused: (paused: boolean) => void;
  clear: () => void;
}

const MAX_CLOSED = 1000;

export const useConnectionsStore = create<
  ConnectionsState & ConnectionsActions
>((set, get) => ({
  active: [],
  closed: [],
  downloadTotal: 0,
  uploadTotal: 0,
  totalDownloadSpeed: 0,
  totalUploadSpeed: 0,
  streamStatus: "disconnected",
  isPaused: false,

  setFrame: (frame) => {
    if (get().isPaused) return;
    const prevActive = get().active;
    const prevMap = new Map(prevActive.map((c) => [c.id, c]));

    const newActive: ConnectionEntry[] = frame.connections.map((snap) => {
      const prev = prevMap.get(snap.id);
      return {
        ...snap,
        downloadSpeed: prev ? snap.download - prev.download : 0,
        uploadSpeed: prev ? snap.upload - prev.upload : 0,
      };
    });

    const totalDownloadSpeed = newActive.reduce(
      (sum, c) => sum + c.downloadSpeed,
      0,
    );
    const totalUploadSpeed = newActive.reduce(
      (sum, c) => sum + c.uploadSpeed,
      0,
    );

    const newIds = new Set(frame.connections.map((c) => c.id));
    const disappeared = prevActive.filter((c) => !newIds.has(c.id));

    set((state) => ({
      active: newActive,
      downloadTotal: frame.downloadTotal,
      uploadTotal: frame.uploadTotal,
      totalDownloadSpeed,
      totalUploadSpeed,
      closed:
        disappeared.length > 0
          ? [...disappeared, ...state.closed].slice(0, MAX_CLOSED)
          : state.closed,
    }));
  },

  addClosed: (entries) => {
    set((state) => ({
      closed: [...entries, ...state.closed].slice(0, MAX_CLOSED),
    }));
  },

  setStreamStatus: (streamStatus) => set({ streamStatus }),

  setIsPaused: (isPaused) => set({ isPaused }),

  clear: () =>
    set({
      active: [],
      closed: [],
      downloadTotal: 0,
      uploadTotal: 0,
      totalDownloadSpeed: 0,
      totalUploadSpeed: 0,
      streamStatus: "disconnected",
      isPaused: false,
    }),
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
  const store = useConnectionsStore.getState();
  store.setStreamStatus("connecting");

  ws = new WebSocket(buildCoreWebSocketUrl("connections"));

  ws.onopen = () => {
    store.setStreamStatus("connected");
  };

  ws.onmessage = (e) => {
    try {
      const frame = JSON.parse(e.data as string) as CoreConnectionsFrame;
      useConnectionsStore.getState().setFrame(frame);
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

function sortEntries(
  entries: ConnectionEntry[],
  key: ConnectionColumnKey,
  direction: SortDirection,
): ConnectionEntry[] {
  const def = columnDefinitions[key];
  return [...entries].sort((a, b) => {
    const av = def.getValue(a);
    const bv = def.getValue(b);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return direction === "asc" ? cmp : -cmp;
  });
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function groupConnections(
  entries: ConnectionEntry[],
  groupedColKey: ConnectionColumnKey,
  sortKey: ConnectionColumnKey,
  sortDirection: SortDirection,
): ConnectionGroup[] {
  const col = columnDefinitions[groupedColKey];
  if (!col) return [];

  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      rawValue: number | string;
      items: ConnectionEntry[];
    }
  >();

  for (const conn of entries) {
    const rawValue = col.getValue(conn);
    const label = String(rawValue || "--");
    const id = `${col.key}:${label}`;
    const existing = groups.get(id);
    if (existing) {
      existing.items.push(conn);
    } else {
      groups.set(id, { id, label, rawValue, items: [conn] });
    }
  }

  const groupDirection = sortKey === col.key ? sortDirection : "asc";

  return Array.from(groups.values())
    .sort((a, b) => {
      const result = compareValues(a.rawValue, b.rawValue);
      if (result !== 0) return groupDirection === "asc" ? result : -result;
      return a.id.localeCompare(b.id);
    })
    .map((group) => ({
      id: group.id,
      label: group.label,
      column: col,
      items: sortEntries(group.items, sortKey, sortDirection),
    }));
}

export function formatConnectionValue(
  key: ConnectionColumnKey,
  entry: ConnectionEntry,
): string {
  switch (key) {
    case "downloadSpeed":
      return formatSpeed(entry.downloadSpeed);
    case "uploadSpeed":
      return formatSpeed(entry.uploadSpeed);
    case "download":
      return formatSpeed(entry.download);
    case "upload":
      return formatSpeed(entry.upload);
    case "chain":
      return entry.chains.join(" → ");
    case "start":
      return formatRelativeDuration(entry.start);
    case "host":
      return getConnectionHost(entry);
    case "destination":
      return `${entry.metadata.destinationIP}:${entry.metadata.destinationPort}`;
    case "source":
      return `${entry.metadata.sourceIP}:${entry.metadata.sourcePort}`;
    case "process":
      return entry.metadata.processPath?.split(/[/\\]/).pop() ?? "";
    case "network":
      return entry.metadata.network;
    case "rule":
      return entry.rule;
  }
}

export function startConnectionsStream() {
  if (shouldReconnect) return;
  shouldReconnect = true;
  connectWs();
}

export function stopConnectionsStream(clear = false) {
  shouldReconnect = false;
  clearReconnectTimer();
  if (ws) {
    const activeWs = ws;
    ws = null;
    activeWs.close();
  } else {
    useConnectionsStore.getState().setStreamStatus("disconnected");
  }
  if (clear) {
    useConnectionsStore.getState().clear();
  }
}

export function useConnectionsStream() {
  const { success, error } = useToast();
  const active = useConnectionsStore((s) => s.active);
  const closed = useConnectionsStore((s) => s.closed);
  const downloadTotal = useConnectionsStore((s) => s.downloadTotal);
  const uploadTotal = useConnectionsStore((s) => s.uploadTotal);
  const streamStatus = useConnectionsStore((s) => s.streamStatus);
  const isPaused = useConnectionsStore((s) => s.isPaused);

  const settings = useSettingsStore((s) => s.settings.connections);
  const setConnectionsGroupedColumn = useSettingsStore(
    (s) => s.setConnectionsGroupedColumn,
  );
  const setConnectionGroupCollapsed = useSettingsStore(
    (s) => s.setConnectionGroupCollapsed,
  );

  const visibleColumns = useMemo(
    () => settings.visible_columns.map((k) => columnDefinitions[k]),
    [settings.visible_columns],
  );

  const entries = settings.current_tab === "active" ? active : closed;

  const sortedEntries = useMemo(
    () => sortEntries(entries, settings.sort_key, settings.sort_direction),
    [entries, settings.sort_key, settings.sort_direction],
  );

  const groupedColumn: ConnectionColumnOption | null = settings.grouped_column
    ? (columnDefinitions[settings.grouped_column] ?? null)
    : null;

  const startStream = useCallback(() => {
    if (shouldReconnect) return;
    shouldReconnect = true;
    connectWs();
  }, []);

  const stopStream = useCallback((clear = false) => {
    shouldReconnect = false;
    clearReconnectTimer();
    if (ws) {
      const activeWs = ws;
      ws = null;
      activeWs.close();
    } else {
      useConnectionsStore.getState().setStreamStatus("disconnected");
    }
    if (clear) {
      useConnectionsStore.getState().clear();
    }
  }, []);

  const togglePause = useCallback(() => {
    useConnectionsStore.getState().setIsPaused(!isPaused);
  }, [isPaused]);

  const closeAll = useCallback(async () => {
    try {
      await coreRequest("connections", { method: "DELETE" });
      success("All connections closed");
    } catch {
      error("Failed to close connections");
    }
  }, [success, error]);

  const toggleGrouping = useCallback(
    (key: ConnectionColumnKey) => {
      const col = columnDefinitions[key];
      if (!col?.groupable) return;
      const next = settings.grouped_column === key ? null : key;
      void setConnectionsGroupedColumn(next);
    },
    [settings.grouped_column, setConnectionsGroupedColumn],
  );

  const clearGrouping = useCallback(() => {
    void setConnectionsGroupedColumn(null);
  }, [setConnectionsGroupedColumn]);

  const toggleGroupCollapsed = useCallback(
    (groupId: string) => {
      const isCollapsed = Boolean(settings.collapsed_groups[groupId]);
      void setConnectionGroupCollapsed(groupId, !isCollapsed);
    },
    [settings.collapsed_groups, setConnectionGroupCollapsed],
  );

  const isGroupCollapsed = useCallback(
    (groupId: string) => {
      return Boolean(settings.collapsed_groups[groupId]);
    },
    [settings.collapsed_groups],
  );

  return {
    active,
    closed,
    entries: sortedEntries,
    rawEntries: entries,
    downloadTotal,
    uploadTotal,
    streamStatus,
    isPaused,
    visibleColumns,
    allColumns,
    groupedColumn,
    startStream,
    stopStream,
    togglePause,
    closeAll,
    toggleGrouping,
    clearGrouping,
    toggleGroupCollapsed,
    isGroupCollapsed,
  };
}
