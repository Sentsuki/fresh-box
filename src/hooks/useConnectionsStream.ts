import { useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  closeAllConnections,
  startConnectionsStream as startConnectionsStreamCmd,
  stopConnectionsStream as stopConnectionsStreamCmd,
} from "../services/api";
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

interface ConnectionColumnDefinition extends ConnectionColumnOption {
  defaultDirection: SortDirection;
  getValue: (c: ConnectionEntry) => number | string;
}

function getConnectionHost(c: ConnectionEntry): string {
  const { host, destinationIP, destinationPort, sniffHost } = c.metadata;
  const h = host || sniffHost || destinationIP;
  if (h.includes(":")) {
    return `[${h}]:${destinationPort}`;
  }
  return `${h}:${destinationPort}`;
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
      c.metadata.remoteDestination ||
      c.metadata.destinationIP ||
      c.metadata.host,
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
    getValue: (c) =>
      c.metadata.process ||
      c.metadata.processPath?.split(/[/\\\\]/).pop() ||
      "-",
  },
  network: {
    key: "network",
    label: "Network",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => `${c.metadata.type} | ${c.metadata.network}`,
  },
  start: {
    key: "start",
    label: "Duration",
    sortable: true,
    groupable: false,
    defaultDirection: "asc",
    getValue: (c) => c.start,
  },
  sniffHost: {
    key: "sniffHost",
    label: "Sniff Host",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.sniffHost || "-",
  },
  outbound: {
    key: "outbound",
    label: "Outbound",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.chains[0] || "-",
  },
  sourcePort: {
    key: "sourcePort",
    label: "Source Port",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.sourcePort,
  },
  sourceIP: {
    key: "sourceIP",
    label: "Source IP",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.sourceIP,
  },
  destinationType: {
    key: "destinationType",
    label: "Dest Type",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => {
      const dest = c.metadata.destinationIP || c.metadata.host;
      if (dest.includes(":")) return "IPv6";
      if (/^\d+\.\d+\.\d+\.\d+$/.test(dest)) return "IPv4";
      return "FQDN";
    },
  },
  remoteAddress: {
    key: "remoteAddress",
    label: "Remote Address",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) => c.metadata.remoteDestination || "-",
  },
  inboundUser: {
    key: "inboundUser",
    label: "Inbound User",
    sortable: true,
    groupable: true,
    defaultDirection: "asc",
    getValue: (c) =>
      c.metadata.inboundUser ||
      c.metadata.inboundName ||
      c.metadata.inboundPort ||
      "-",
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

export function startConnectionsStream() {
  void startConnectionsStreamCmd();
}

export function stopConnectionsStream(clear = false) {
  void stopConnectionsStreamCmd();
  if (clear) {
    useConnectionsStore.getState().clear();
  }
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

// compareValues kept for potential future use; groupConnections removed in favour
// of TanStack Table's getGroupedRowModel.
void compareValues;

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
      return (
        entry.metadata.remoteDestination ||
        entry.metadata.destinationIP ||
        entry.metadata.host
      );
    case "source":
      return `${entry.metadata.sourceIP}:${entry.metadata.sourcePort}`;
    case "process":
      return (
        entry.metadata.process ||
        entry.metadata.processPath?.split(/[/\\\\]/).pop() ||
        "-"
      );
    case "network":
      return `${entry.metadata.type} | ${entry.metadata.network}`;
    case "rule":
      return entry.rule;
    case "sniffHost":
      return entry.metadata.sniffHost || "-";
    case "outbound":
      return entry.chains[0] || "-";
    case "sourcePort":
      return entry.metadata.sourcePort;
    case "sourceIP":
      return entry.metadata.sourceIP;
    case "destinationType": {
      const dest = entry.metadata.destinationIP || entry.metadata.host;
      if (dest.includes(":")) return "IPv6";
      if (/^\d+\.\d+\.\d+\.\d+$/.test(dest)) return "IPv4";
      return "FQDN";
    }
    case "remoteAddress":
      return entry.metadata.remoteDestination || "-";
    case "inboundUser":
      return (
        entry.metadata.inboundUser ||
        entry.metadata.inboundName ||
        entry.metadata.inboundPort ||
        "-"
      );
  }
}

// Register event listeners at module level so they're always active.
void listen<string>("stream-connections-status", (e) => {
  useConnectionsStore
    .getState()
    .setStreamStatus(
      e.payload as "disconnected" | "connecting" | "connected" | "error",
    );
});

void listen<CoreConnectionsFrame>("stream-connections", (e) => {
  useConnectionsStore.getState().setFrame(e.payload);
});

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
    startConnectionsStream();
  }, []);

  const stopStream = useCallback((clear = false) => {
    stopConnectionsStream(clear);
  }, []);

  const togglePause = useCallback(() => {
    useConnectionsStore.getState().setIsPaused(!isPaused);
  }, [isPaused]);

  const closeAll = useCallback(async () => {
    try {
      await closeAllConnections();
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

  return {
    active,
    closed,
    entries: sortedEntries,
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
  };
}
