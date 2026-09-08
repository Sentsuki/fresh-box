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

/**
 * A config file fresh-box manages, keyed by a stable `id` that never
 * changes — renaming only ever changes `name`. `url`/`lastUpdated` are
 * present only for subscriptions (fetched from a URL); a locally imported
 * file has neither.
 */
export interface ProfilesSettings {
  /** 选中的档案 id。阶段 4 之前存的是磁盘路径 —— 内容文件现在按 UUID 命名，
   * 路径对前端没有意义，也不该被当成身份来传。 */
  selected_profile_id: string | null;
}

export interface ProfileEntry {
  id: string;
  name: string;
  url?: string | null;
  lastUpdated?: string | null;
  autoUpdate: boolean;
  updateIntervalMinutes?: number | null;
}

/** Mirrors the backend's `config::profiles::MINIMUM_UPDATE_INTERVAL_MINUTES`
 * — kept here too so the UI can reject/clamp an obviously-too-small value
 * before round-tripping to the backend at all. */
export const MINIMUM_AUTO_UPDATE_INTERVAL_MINUTES = 15;
/** Mirrors `config::profiles::DEFAULT_UPDATE_INTERVAL_MINUTES`. */
export const DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES = 60;

export interface AppConfig {
  current_page: AppPage;
}



export interface AppDisplaySettings {
  theme_mode: ThemeMode;
  close_behavior: "hide" | "destroy";
  auto_close_connections: boolean;
}

export interface ProxyPageSettings {
  collapsed_groups: Record<string, boolean>;
}

export interface ConnectionPageSettings {
  current_tab: ConnectionPageTab;
  visible_columns: ConnectionColumnKey[];
  pinned_columns: ConnectionColumnKey[];
  sort_key: ConnectionColumnKey;
  sort_direction: SortDirection;
  grouped_column: ConnectionColumnKey | null;
  column_sizes: Record<string, number>;
}

export interface LogsPageSettings {
  type_filter: string;
}

/**
 * Pure frontend bookkeeping for the update-check flow —
 * `@tauri-apps/plugin-updater` does the actual checking/downloading/
 * installing; this only ever decides *when* to call it and *whether to
 * bother the user again* about a version already shown. Mirrors the
 * backend's `config::app_settings::UpdateSettings`.
 */
export interface UpdateSettings {
  /** Opt-in, like the official desktop client — `false` on a fresh install
   * so nothing phones home to GitHub until the user agrees to it. */
  check_update_enabled: boolean;
  /** Whether the one-time "enable automatic update checks?" prompt has
   * already been shown, regardless of which way it was answered. */
  update_check_prompted: boolean;
  /** The version of the last update the user was actually notified about —
   * so it isn't re-announced on every single launch. */
  last_shown_update_version: string;
}

/**
 * Passed to the daemon's `StartOptions` on every start — mirrors the
 * backend's `config::app_settings::DiagnosticsSettings`. Both OOM killer and
 * power-event recording are off by default; changing either only takes
 * effect the next time sing-box (re)starts, same as the TUN stack setting.
 */
export interface DiagnosticsSettings {
  oom_killer_enabled: boolean;
  oom_memory_limit_mb: number;
  power_report_enabled: boolean;
}

export interface AppSettings {
  schema_version: number;
  app: AppConfig;
  proxies: ProxyPageSettings;
  connections: ConnectionPageSettings;
  logs: LogsPageSettings;
  profiles: ProfilesSettings;
  settings: AppDisplaySettings;
  updates: UpdateSettings;
  diagnostics: DiagnosticsSettings;
}

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
    schema_version: 1,
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

export function normalizeAppSettings(
  settings: AppSettings | null | undefined,
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
    schema_version:
      typeof settings.schema_version === "number" ? settings.schema_version : 1,
    app: {
      current_page: APP_PAGES.includes(settings.app?.current_page)
        ? settings.app.current_page
        : defaults.app.current_page,
    },
    proxies: {
      collapsed_groups: normalizeBooleanRecord(
        settings.proxies?.collapsed_groups,
      ),
    },
    connections: {
      current_tab: CONNECTION_TABS.includes(settings.connections?.current_tab)
        ? settings.connections.current_tab
        : defaults.connections.current_tab,
      visible_columns: visibleColumns,
      pinned_columns: pinnedColumns,
      sort_key: CONNECTION_COLUMNS.has(settings.connections?.sort_key)
        ? settings.connections.sort_key
        : defaults.connections.sort_key,
      sort_direction: SORT_DIRECTIONS.includes(
        settings.connections?.sort_direction,
      )
        ? settings.connections.sort_direction
        : defaults.connections.sort_direction,
      grouped_column: CONNECTION_COLUMNS.has(
        settings.connections?.grouped_column as ConnectionColumnKey,
      )
        ? (settings.connections?.grouped_column ?? null)
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

/** Mirrors the backend's `errors::CommandError` discriminant (the `kind` of
 * its `#[serde(tag = "kind", content = "message")]` encoding) — lets the
 * frontend branch on *why* a command failed instead of pattern-matching the
 * human-readable message text. See `services/tauri.ts`'s `getErrorKind`. */
export type CommandErrorKind =
  | "process_already_running"
  | "process_not_running"
  | "network_error"
  | "permission_denied"
  | "validation_error"
  | "invalid_state"
  | "resource_not_found"
  | "failed_to_start_process"
  | "io_error"
  | "json_error";

export interface CommandErrorPayload {
  kind?: CommandErrorKind;
  message?: string;
  [key: string]: unknown;
}

export interface ConfigOverride {
  [key: string]: unknown;
}

export type StackOption = "mixed" | "gvisor" | "system";

export interface LogConfig {
  disabled: boolean;
  level: LogLevel | string;
}

export interface PriorityInbound {
  stack: string;
}

export interface PriorityConfig {
  inbounds: PriorityInbound[];
  log: LogConfig;
}

export interface ConfigFieldsCheck {
  has_stack_field: boolean;
  has_log_field: boolean;
  current_stack_value?: string;
  current_log_disabled?: boolean;
  current_log_level?: string;
}

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

/** A crash/OOM/power report's list entry. Crash report `id`s carry an
 * `app:`/`daemon:` source prefix (see `commands::reports`); OOM/power report
 * `name`s don't need one — they only ever come from the daemon. */
export interface ReportSummary {
  id: string;
  /** RFC3339. */
  time: string;
  isRead: boolean;
}

/** One file within a report's detail view. `content` is `null` for a binary
 * file (an OOM memory profile) that isn't shown inline. */
export interface ReportFileView {
  name: string;
  content: string | null;
  isBinary: boolean;
}
