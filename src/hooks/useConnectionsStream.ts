import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { startedService } from "../daemon/clients";
import { useTrafficStore } from "./useTrafficStream";
import {
  startConnectionsStream,
  stopConnectionsStream,
} from "../daemon/connectionsStream";
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
    getValue: (c) => [...c.chains].reverse().join(" → "),
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
      c.metadata.inboundUser || c.metadata.inboundName || "-",
  },
};

export const allColumns: ConnectionColumnOption[] =
  DEFAULT_CONNECTION_COLUMN_ORDER.map((key) => columnDefinitions[key]);

interface ConnectionsState {
  active: ConnectionEntry[];
  closed: ConnectionEntry[];
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  isPaused: boolean;
}

interface ConnectionsActions {
  setFrame: (frame: CoreConnectionsFrame) => void;
  setStreamStatus: (s: ConnectionsState["streamStatus"]) => void;
  setIsPaused: (paused: boolean) => void;
  clear: () => void;
}

export const useConnectionsStore = create<
  ConnectionsState & ConnectionsActions
>((set, get) => ({
  active: [],
  closed: [],
  totalDownloadSpeed: 0,
  totalUploadSpeed: 0,
  streamStatus: "disconnected",
  isPaused: false,

  // 累加在 `daemon/connectionsStream.ts` 里做（含「已关闭」列表）——
  // 这里只负责把整帧结果放进 store。以前「已关闭」是靠逐帧 diff 反推的，
  // 因为 Rust 把 CLOSED 事件的载荷丢掉了；现在那份载荷直接可用。
  setFrame: (frame) => {
    if (get().isPaused) return;
    set({
      active: frame.connections,
      closed: frame.closed,
      totalDownloadSpeed: frame.totalDownloadSpeed,
      totalUploadSpeed: frame.totalUploadSpeed,
    });
  },

  setStreamStatus: (streamStatus) => set({ streamStatus }),

  setIsPaused: (isPaused) => set({ isPaused }),

  clear: () =>
    set({
      active: [],
      closed: [],
      totalDownloadSpeed: 0,
      totalUploadSpeed: 0,
      streamStatus: "disconnected",
      isPaused: false,
    }),
}));

export { startConnectionsStream, stopConnectionsStream };

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
      return [...entry.chains].reverse().join(" → ");
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
        entry.metadata.inboundUser || entry.metadata.inboundName || "-"
      );
  }
}

export function useConnectionsStream() {
  const { success, error } = useToast();
  const active = useConnectionsStore((s) => s.active);
  const closed = useConnectionsStore((s) => s.closed);
  // 会话累计流量来自 `Status.downlinkTotal`/`uplinkTotal`（流量 store），
  // 不是对活跃连接求和 —— 后者会随连接关闭而回落（审计项 M-07）。
  const downloadTotal = useTrafficStore((s) => s.downloadTotal);
  const uploadTotal = useTrafficStore((s) => s.uploadTotal);
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
      await startedService.closeAllConnections({});
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
