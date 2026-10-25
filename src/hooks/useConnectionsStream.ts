import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { startedService } from "../daemon/clients";
import { useTrafficStore } from "./useTrafficStream";
import {
  startConnectionsStream,
  stopConnectionsStream,
} from "../daemon/connectionsStream";
import type { StreamStatus } from "../daemon/subscription";
import {
  formatBytes,
  formatRelativeDuration,
  formatSpeed,
} from "../services/utils";
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
  /** 排序键。数值列返回数字，排序按大小比而不是按显示出来的字符串比。 */
  getValue: (c: ConnectionEntry) => number | string;
  /** 显示（以及搜索、分组）用的文本。省略时就是 `getValue` 的结果本身 ——
   * 只有排序键和显示文本不一样的列（流量、时长）才需要写。 */
  format?: (c: ConnectionEntry) => string;
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
    format: (c) => formatSpeed(c.downloadSpeed),
  },
  uploadSpeed: {
    key: "uploadSpeed",
    label: "UL Speed",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.uploadSpeed,
    format: (c) => formatSpeed(c.uploadSpeed),
  },
  download: {
    key: "download",
    label: "Download",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.download,
    format: (c) => formatBytes(c.download),
  },
  upload: {
    key: "upload",
    label: "Upload",
    sortable: true,
    groupable: false,
    align: "end",
    defaultDirection: "desc",
    getValue: (c) => c.upload,
    format: (c) => formatBytes(c.upload),
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
    format: (c) => formatRelativeDuration(c.start),
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
    getValue: (c) => c.metadata.inboundUser || c.metadata.inboundName || "-",
  },
};

export const allColumns: ConnectionColumnOption[] =
  DEFAULT_CONNECTION_COLUMN_ORDER.map((key) => columnDefinitions[key]);

interface ConnectionsState {
  active: ConnectionEntry[];
  closed: ConnectionEntry[];
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  streamStatus: StreamStatus;
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

/** 按某一列的排序键升序比较两条连接。数值列按大小比，其余按字符串比。 */
export function compareConnections(
  key: ConnectionColumnKey,
  a: ConnectionEntry,
  b: ConnectionEntry,
): number {
  const def = columnDefinitions[key];
  const av = def.getValue(a);
  const bv = def.getValue(b);
  return typeof av === "number" && typeof bv === "number"
    ? av - bv
    : String(av).localeCompare(String(bv));
}

/** 排序函数用到的那一小部分 TanStack 行接口 —— 单测里可以直接造。 */
export interface SortableConnectionRow {
  original: ConnectionEntry;
  getIsGrouped: () => boolean;
  getLeafRows: () => SortableConnectionRow[];
}

/**
 * 给 TanStack Table 用的排序函数（升序语义，降序由表格自己取反）。
 *
 * 分组时表格是先分组再排序，组行的 `original` 只是组里第一条原始数据 ——
 * 按它比，组与组的先后就是随机的。所以组行改用组内排在最前的那一条来比：
 * 升序取最小、降序取最大，和以前「先整体排好序再分组」得到的组顺序一致。
 */
export function connectionSortFn(key: ConnectionColumnKey, desc: boolean) {
  const representative = (row: SortableConnectionRow): ConnectionEntry => {
    if (!row.getIsGrouped()) return row.original;
    let best = row.original;
    for (const leaf of row.getLeafRows()) {
      const cmp = compareConnections(key, leaf.original, best);
      if (desc ? cmp > 0 : cmp < 0) best = leaf.original;
    }
    return best;
  };
  return (a: SortableConnectionRow, b: SortableConnectionRow) =>
    compareConnections(key, representative(a), representative(b));
}

export function formatConnectionValue(
  key: ConnectionColumnKey,
  entry: ConnectionEntry,
): string {
  const def = columnDefinitions[key];
  return def.format ? def.format(entry) : String(def.getValue(entry));
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

  // 排序交给表格（`ConnectionTable` 里的 `getSortedRowModel`），这里给原始顺序。
  const entries = settings.current_tab === "active" ? active : closed;

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
    entries,
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
