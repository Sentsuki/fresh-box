// 前端自己的视图模型与常量。
//
// 跨 IPC 的 host 域类型**不在这里** —— 它们由 Rust 生成（`src/gen/host.ts`，
// 见 `src-tauri/src/ipc.rs`），这里只做重导出，让调用点的 import 路径不用改。
// daemon 域的类型同理，由 protobuf 生成（`src/gen/daemon/`、`src/gen/boxdd/`）。
//
// 阶段 5 之前这个文件里有一份手抄的镜像：Rust 改个字段名，这边不会有任何编译
// 错误，运行时表现是那个字段恒为 `undefined`。

export type {
  AppConfig,
  AppDisplaySettings,
  CommandError,
  ConfigFieldsCheck,
  ConnectionPageSettings,
  DiagnosticsSettings,
  LogConfig,
  LogsPageSettings,
  PriorityConfig,
  PriorityInbound,
  ProfileOperationResult,
  ProfilesSettings,
  ProxyPageSettings,
  ReportFileView,
  ReportSummary,
  UpdateSettings,
} from "../gen/host";

/** Rust 侧叫 `Profile`；前端一直用 `ProfileEntry` 这个名字。 */
export type { Profile as ProfileEntry } from "../gen/host";

import type * as Host from "../gen/host";

/**
 * 归一化后的设置：每个区、每个字段都一定在。
 *
 * 生成的 `Host.AppSettings` 里字段全是可选的 —— Rust 侧每个区都带
 * `#[serde(default)]`，那是**反序列化的健壮性**（某一区的行损坏时退回默认值），
 * 不该扩散成前端每次读设置都要 `?.` 和 `??`。
 *
 * 所以这里从生成类型派生出一份全必填的形状（字段名一个都没重抄），由
 * `normalizeAppSettings` 在 IPC 边界上补齐一次。
 */
export type AppSettings = {
  app: Omit<Required<Host.AppConfig>, "current_page"> & { current_page: AppPage };
  proxies: Required<Host.ProxyPageSettings>;
  // Rust 侧这些是 `String`/`Vec<String>`（存储层不该知道有哪些列、有哪些标签
  // 页）。前端知道得更具体，所以在这里收窄 —— 这不是重抄类型，是给同一个
  // 字段加上前端才有的约束。
  connections: Omit<
    Required<Host.ConnectionPageSettings>,
    | "current_tab"
    | "visible_columns"
    | "pinned_columns"
    | "sort_key"
    | "sort_direction"
    | "grouped_column"
    | "column_sizes"
  > & {
    current_tab: ConnectionPageTab;
    visible_columns: ConnectionColumnKey[];
    pinned_columns: ConnectionColumnKey[];
    sort_key: ConnectionColumnKey;
    sort_direction: SortDirection;
    grouped_column: ConnectionColumnKey | null;
    column_sizes: Record<string, number>;
  };
  logs: Required<Host.LogsPageSettings>;
  profiles: Required<Host.ProfilesSettings>;
  settings: Omit<Required<Host.AppDisplaySettings>, "theme_mode"> & {
    theme_mode: ThemeMode;
  };
  updates: Required<Host.UpdateSettings>;
  diagnostics: Required<Host.DiagnosticsSettings>;
};

export type ThemeMode = "light" | "dark" | "system";

export type AppPage =
  | "overview"
  | "proxy"
  | "connections"
  | "logs"
  | "profiles"
  | "advanced"
  | "settings";

export type ConnectionPageTab = "active" | "closed";
export type SortDirection = "asc" | "desc";
export type ConnectionColumnKey =
  | "host"
  | "destination"
  | "downloadSpeed"
  | "uploadSpeed"
  | "download"
  | "upload"
  | "chain"
  | "rule"
  | "source"
  | "process"
  | "network"
  | "start"
  | "sniffHost"
  | "outbound"
  | "sourcePort"
  | "sourceIP"
  | "destinationType"
  | "remoteAddress"
  | "inboundUser";
export type LogLevel =
  "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic";

/** Mirrors the backend's `config::profiles::MINIMUM_UPDATE_INTERVAL_MINUTES`
 * — kept here too so the UI can reject/clamp an obviously-too-small value
 * before round-tripping to the backend at all. */
export const MINIMUM_AUTO_UPDATE_INTERVAL_MINUTES = 15;
/** Mirrors `config::profiles::DEFAULT_UPDATE_INTERVAL_MINUTES`. */
export const DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES = 60;



export const DEFAULT_CONNECTION_COLUMN_ORDER: ConnectionColumnKey[] = [
  "host",
  "destination",
  "downloadSpeed",
  "uploadSpeed",
  "download",
  "upload",
  "chain",
  "rule",
  "source",
  "process",
  "network",
  "start",
  "sniffHost",
  "outbound",
  "sourcePort",
  "sourceIP",
  "destinationType",
  "remoteAddress",
  "inboundUser",
];

export const DEFAULT_CONNECTION_VISIBLE_COLUMNS: ConnectionColumnKey[] = [
  "process",
  "downloadSpeed",
  "uploadSpeed",
  "chain",
  "destination",
];

export function createDefaultAppSettings(): AppSettings {
  return {
    app: {
      current_page: "overview",
    },
    proxies: {
      collapsed_groups: {},
    },
    connections: {
      current_tab: "active",
      visible_columns: [...DEFAULT_CONNECTION_VISIBLE_COLUMNS],
      pinned_columns: [],
      sort_key: "downloadSpeed",
      sort_direction: "desc",
      grouped_column: null,
      column_sizes: {},
    },
    logs: {
      type_filter: "",
    },
    profiles: {
      selected_profile_id: null,
    },
    settings: {
      theme_mode: "system",
      close_behavior: "hide",
      auto_close_connections: true,
    },
    updates: {
      check_update_enabled: false,
      update_check_prompted: false,
      last_shown_update_version: "",
    },
    diagnostics: {
      oom_killer_enabled: false,
      oom_memory_limit_mb: 200,
      power_report_enabled: false,
    },
  };
}

const APP_PAGES: AppPage[] = [
  "overview",
  "proxy",
  "connections",
  "logs",
  "profiles",
  "advanced",
  "settings",
];
const CONNECTION_TABS: ConnectionPageTab[] = ["active", "closed"];
const CONNECTION_COLUMNS = new Set<ConnectionColumnKey>(
  DEFAULT_CONNECTION_COLUMN_ORDER,
);
const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];

function normalizeColumnList(value: unknown): ConnectionColumnKey[] {
  const raw = Array.isArray(value)
    ? value.filter(
        (item): item is ConnectionColumnKey =>
          typeof item === "string" &&
          CONNECTION_COLUMNS.has(item as ConnectionColumnKey),
      )
    : [];
  const seen = new Set<ConnectionColumnKey>();
  const next: ConnectionColumnKey[] = [];

  for (const key of raw) {
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }

  return next;
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

/**
 * 把 Rust 传回来的（各字段可选的）设置补齐成前端用的全必填形状。
 *
 * 入参是**生成的** `Host.AppSettings`，出参是本文件里那个窄化过的
 * `AppSettings` —— 这个函数就是两者之间唯一的转换点。
 */
/**
 * 从一组允许值里挑，挑不中就退回默认值。
 *
 * Rust 侧这些字段是 `String`（存储层不该知道有哪些页面、哪些列），生成的类型
 * 因此是 `string | undefined`。这个 helper 就是收窄的那一步 —— 它是类型守卫，
 * 所以调用点不需要 `as`。
 */
function oneOf<T extends string>(
  allowed: readonly T[] | ReadonlySet<T>,
  value: string | null | undefined,
  fallback: T,
): T {
  if (value === null || value === undefined) return fallback;
  const ok =
    allowed instanceof Set
      ? allowed.has(value as T)
      : (allowed as readonly T[]).includes(value as T);
  return ok ? (value as T) : fallback;
}

export function normalizeAppSettings(
  settings: Host.AppSettings | null | undefined,
): AppSettings {
  const defaults = createDefaultAppSettings();
  if (!settings) return defaults;

  const hasVisibleColumnsSetting = Boolean(
    settings.connections &&
    Object.prototype.hasOwnProperty.call(
      settings.connections,
      "visible_columns",
    ),
  );
  const visibleColumns = hasVisibleColumnsSetting
    ? normalizeColumnList(settings.connections?.visible_columns)
    : [...DEFAULT_CONNECTION_VISIBLE_COLUMNS];
  const hasPinnedColumnsSetting = Boolean(
    settings.connections &&
    Object.prototype.hasOwnProperty.call(
      settings.connections,
      "pinned_columns",
    ),
  );
  const pinnedColumns = hasPinnedColumnsSetting
    ? normalizeColumnList(settings.connections?.pinned_columns)
    : defaults.connections.pinned_columns;

  return {
    app: {
      current_page: oneOf(
        APP_PAGES,
        settings.app?.current_page,
        defaults.app.current_page,
      ),
    },
    proxies: {
      collapsed_groups: normalizeBooleanRecord(
        settings.proxies?.collapsed_groups,
      ),
    },
    connections: {
      current_tab: oneOf(
        CONNECTION_TABS,
        settings.connections?.current_tab,
        defaults.connections.current_tab,
      ),
      visible_columns: visibleColumns,
      pinned_columns: pinnedColumns,
      sort_key: oneOf(
        CONNECTION_COLUMNS,
        settings.connections?.sort_key,
        defaults.connections.sort_key,
      ),
      sort_direction: oneOf(
        SORT_DIRECTIONS,
        settings.connections?.sort_direction,
        defaults.connections.sort_direction,
      ),
      grouped_column: settings.connections?.grouped_column
        ? oneOf(
            CONNECTION_COLUMNS,
            settings.connections.grouped_column,
            defaults.connections.sort_key,
          )
        : null,
      column_sizes: normalizeNumberRecord(settings.connections?.column_sizes),
    },
    logs: {
      type_filter: settings.logs?.type_filter ?? "",
    },
    profiles: {
      selected_profile_id: settings.profiles?.selected_profile_id ?? null,
    },
    settings: {
      theme_mode:
        settings.settings?.theme_mode === "light" ||
        settings.settings?.theme_mode === "dark" ||
        settings.settings?.theme_mode === "system"
          ? settings.settings.theme_mode
          : "system",
      close_behavior:
        settings.settings?.close_behavior === "destroy" ? "destroy" : "hide",
      auto_close_connections: settings.settings?.auto_close_connections ?? true,
    },
    updates: {
      check_update_enabled: settings.updates?.check_update_enabled ?? false,
      update_check_prompted: settings.updates?.update_check_prompted ?? false,
      last_shown_update_version:
        settings.updates?.last_shown_update_version ?? "",
    },
    diagnostics: {
      oom_killer_enabled:
        settings.diagnostics?.oom_killer_enabled ??
        defaults.diagnostics.oom_killer_enabled,
      oom_memory_limit_mb:
        typeof settings.diagnostics?.oom_memory_limit_mb === "number"
          ? settings.diagnostics.oom_memory_limit_mb
          : defaults.diagnostics.oom_memory_limit_mb,
      power_report_enabled:
        settings.diagnostics?.power_report_enabled ??
        defaults.diagnostics.power_report_enabled,
    },
  };
}

export type StackOption = "mixed" | "gvisor" | "system";

/**
 * 代理页的视图模型。
 *
 * 这**不是** IPC 类型 —— daemon 送来的是 protobuf 的 `Group`/`GroupItem`
 * （`src/gen/daemon/`），`daemon/groupsStream.ts` 把它整理成这个形状给页面用。
 * 阶段 3 之前这是 Rust 拼出来的 Clash 兼容结构，字段一半是硬造的空值。
 */
export interface ProxyNodeOverview {
  name: string;
  kind: string;
  delay: number | null;
  is_selected?: boolean;
}

export interface ProxyGroupOverview {
  name: string;
  kind: string;
  current: string;
  current_delay?: number | null;
  options: ProxyNodeOverview[];
}

export interface ProxyOverview {
  current_mode: string;
  available_modes?: string[];
  proxy_groups: ProxyGroupOverview[];
}

export interface ConnectionMetadata {
  network: string;
  type: string;
  host: string;
  sourceIP: string;
  sourcePort: string;
  destinationIP: string;
  destinationPort: string;
  processPath?: string;
  remoteDestination?: string;
  sniffHost?: string;
  inboundUser?: string;
  inboundName?: string;
  process?: string;
}

export interface CoreConnectionSnapshot {
  id: string;
  metadata: ConnectionMetadata;
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
}

export interface ConnectionEntry extends CoreConnectionSnapshot {
  uploadSpeed: number;
  downloadSpeed: number;
  /** RFC3339，仅「已关闭」标签页里的条目有 —— 来自 CLOSED 事件带的
   * `Connection.closedAt`。以前这个信息在 Rust 侧被丢弃了。 */
  closedAt?: string;
}

/**
 * 一帧累加后的连接状态。
 *
 * 注意这里没有 `downloadTotal`/`uploadTotal`：会话累计流量的正确来源是
 * `Status.downlinkTotal`/`uplinkTotal`（见 `daemon/statusStream.ts`），而不是
 * 对活跃连接求和 —— 后者会随连接关闭而回落（审计项 M-07）。
 */
export interface CoreConnectionsFrame {
  connections: ConnectionEntry[];
  closed: ConnectionEntry[];
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
}

export interface CoreLogMessage {
  type: string;
  payload: string;
}

export interface LogEntry extends CoreLogMessage {
  seq: number;
  time: string;
  category: string;
}

// ── Advanced page: diagnostics tools + reports ──────────────────────────

/** Mirrors `sing-box`'s `networkquality.Phase`. */
export const NETWORK_QUALITY_PHASE = {
  idle: 0,
  download: 1,
  upload: 2,
  done: 3,
} as const;

/** One `tools-network-quality-progress` event payload — see
 * `services::tools::start_network_quality_test`. `0` accuracy/RPM/capacity
 * values mean "not measured yet". Accuracy is `0`=Low, `1`=Medium, `2`=High. */
export interface NetworkQualityProgress {
  phase: number;
  downloadCapacity: number;
  uploadCapacity: number;
  downloadRPM: number;
  uploadRPM: number;
  idleLatencyMs: number;
  elapsedMs: number;
  isFinal: boolean;
  error: string;
  downloadCapacityAccuracy: number;
  uploadCapacityAccuracy: number;
  downloadRPMAccuracy: number;
  uploadRPMAccuracy: number;
}

export interface NetworkQualityTestOptions {
  configURL: string;
  outboundTag: string;
  serial: boolean;
  http3: boolean;
  maxRuntimeSeconds: number;
}

/** One `tools-stun-test-progress` event payload — see
 * `services::tools::start_stun_test`. */
export interface StunTestProgress {
  phase: number;
  externalAddr: string;
  latencyMs: number;
  natMapping: number;
  natFiltering: number;
  isFinal: boolean;
  error: string;
  natTypeSupported: boolean;
}

export interface StunTestOptions {
  server: string;
  outboundTag: string;
}

