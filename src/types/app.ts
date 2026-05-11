export type ThemeMode = "light" | "dark" | "system";

export type AppPage =
  | "overview"
  | "proxy"
  | "connections"
  | "logs"
  | "rules"
  | "profiles"
  | "advanced"
  | "settings";

export type SingboxCoreChannel = "stable" | "testing";
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
export type RulesTab = "rules";
export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "panic";

export interface SubscriptionInfo {
  url: string;
  lastUpdated?: string;
}

export type SubscriptionRecord = Record<string, SubscriptionInfo>;

export interface ConfigFileEntry {
  path: string;
  displayName: string;
}

export interface AppConfig {
  current_page: AppPage;
}

export interface ProfilesSettings {
  selected_config_path: string | null;
  selected_config_display: string | null;
}

export interface AppDisplaySettings {
  theme_mode: ThemeMode;
  singbox_core: SingboxCoreSettings;
  test_url: string;
}

export interface SingboxCoreSettings {
  active_channel: SingboxCoreChannel | null;
  active_version: string | null;
  selected_option_key: string;
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
  expanded_groups: Record<string, boolean>;
  column_sizes: Record<string, number>;
}

export interface LogsPageSettings {
  log_level: LogLevel;
  type_filter: string;
}

export interface RulesPageSettings {
  current_tab: RulesTab;
}

export type AdvancedPageTab = "override" | "dns";

export interface AdvancedPageSettings {
  current_tab: AdvancedPageTab;
}

export interface AppSettings {
  schema_version: number;
  app: AppConfig;
  proxies: ProxyPageSettings;
  connections: ConnectionPageSettings;
  logs: LogsPageSettings;
  rules: RulesPageSettings;
  advanced: AdvancedPageSettings;
  Profiles: ProfilesSettings;
  Settings: AppDisplaySettings;
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

export const DEFAULT_TEST_URL = "https://www.gstatic.com/generate_204";

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
      expanded_groups: {},
      column_sizes: {},
    },
    logs: {
      log_level: "info",
      type_filter: "",
    },
    rules: {
      current_tab: "rules",
    },
    advanced: {
      current_tab: "override",
    },
    Profiles: {
      selected_config_path: null,
      selected_config_display: null,
    },
    Settings: {
      theme_mode: "system",
      singbox_core: {
        active_channel: null,
        active_version: null,
        selected_option_key: "",
      },
      test_url: DEFAULT_TEST_URL,
    },
  };
}

const APP_PAGES: AppPage[] = [
  "overview",
  "proxy",
  "connections",
  "logs",
  "rules",
  "profiles",
  "advanced",
  "settings",
];
const CONNECTION_TABS: ConnectionPageTab[] = ["active", "closed"];
const CONNECTION_COLUMNS = new Set<ConnectionColumnKey>(
  DEFAULT_CONNECTION_COLUMN_ORDER,
);
const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];
const RULES_TABS: RulesTab[] = ["rules"];
const ADVANCED_TABS: AdvancedPageTab[] = ["override", "dns"];
const LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

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
      expanded_groups: normalizeBooleanRecord(
        settings.connections?.expanded_groups,
      ),
      column_sizes: normalizeNumberRecord(settings.connections?.column_sizes),
    },
    logs: {
      log_level: LOG_LEVELS.includes(settings.logs?.log_level)
        ? settings.logs.log_level
        : defaults.logs.log_level,
      type_filter: settings.logs?.type_filter ?? "",
    },
    rules: {
      current_tab: RULES_TABS.includes(settings.rules?.current_tab)
        ? settings.rules.current_tab
        : defaults.rules.current_tab,
    },
    advanced: {
      current_tab: ADVANCED_TABS.includes(settings.advanced?.current_tab)
        ? settings.advanced.current_tab
        : defaults.advanced.current_tab,
    },
    Profiles: {
      selected_config_path: settings.Profiles?.selected_config_path ?? null,
      selected_config_display:
        settings.Profiles?.selected_config_display ?? null,
    },
    Settings: {
      theme_mode:
        settings.Settings?.theme_mode === "light" ||
        settings.Settings?.theme_mode === "dark" ||
        settings.Settings?.theme_mode === "system"
          ? settings.Settings.theme_mode
          : "system",
      singbox_core: {
        active_channel:
          settings.Settings?.singbox_core?.active_channel === "stable" ||
          settings.Settings?.singbox_core?.active_channel === "testing"
            ? settings.Settings.singbox_core.active_channel
            : null,
        active_version: settings.Settings?.singbox_core?.active_version ?? null,
        selected_option_key:
          settings.Settings?.singbox_core?.selected_option_key ?? "",
      },
      test_url:
        typeof settings.Settings?.test_url === "string" &&
        settings.Settings.test_url.trim() !== ""
          ? settings.Settings.test_url
          : DEFAULT_TEST_URL,
    },
  };
}

export interface CommandErrorPayload {
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

export interface PriorityClashApiConfig {
  external_controller?: string;
  secret?: string;
}

export interface PriorityExperimental {
  clash_api?: PriorityClashApiConfig;
}

export interface PriorityConfig {
  inbounds: PriorityInbound[];
  log: LogConfig;
  experimental: PriorityExperimental;
}

export interface ClashApiConfig {
  external_controller?: string;
  secret?: string;
}

export interface CoreClientConfig {
  http_url: string;
  ws_url: string;
  secret: string;
  test_url: string;
}

export interface ConfigFieldsCheck {
  has_stack_field: boolean;
  has_log_field: boolean;
  current_stack_value?: string;
  current_log_disabled?: boolean;
  current_log_level?: string;
}

export interface SingboxCoreOption {
  channel: SingboxCoreChannel;
  version: string;
  label: string;
  installed: boolean;
  is_active: boolean;
}

/**
 * Describes the freshness of the release list returned by the backend.
 * - `no_cache`  No cached list; only local cores shown; install/switch disabled.
 * - `fresh`     List is within the 1-hour TTL or just fetched from GitHub.
 * - `stale`     List is from an expired cache; controls enabled but warn the user.
 */
export type ReleaseCacheState = "no_cache" | "fresh" | "stale";

export interface SingboxCoreStatus {
  installed: boolean;
  current_channel: SingboxCoreChannel | null;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  is_running: boolean;
  available_options: SingboxCoreOption[];
  cache_state: ReleaseCacheState;
  /** Set when a GitHub fetch was attempted (Check button) but failed. */
  fetch_error?: string | null;
}

export interface SingboxCoreUpdateResult {
  success: boolean;
  message: string;
  current_version: string;
  restart_required: boolean;
}

export type CoreUpdateStage =
  | "preparing"
  | "downloading"
  | "extracting"
  | "installing"
  | "complete"
  | "error";

export interface CoreUpdateProgressEvent {
  stage: CoreUpdateStage;
  percent: number;
  message: string;
}

export interface ClashProxyNode {
  name: string;
  kind: string;
  delay: number | null;
  alive?: boolean;
  is_selected?: boolean;
}

export interface ClashProxyGroup {
  name: string;
  kind: string;
  current: string;
  current_delay?: number | null;
  options: ClashProxyNode[];
}

export interface ClashOverview {
  current_mode: string;
  available_modes?: string[];
  proxy_groups: ClashProxyGroup[];
  traffic?: {
    upload: number;
    download: number;
    upload_total: number;
    download_total: number;
  };
  connections_count?: number;
  memory_usage?: number;
}

export interface ClashRulesSnapshot {
  rules: RuleEntry[];
}

export interface RuleEntry {
  type: string;
  payload: string;
  proxy: string;
  uuid?: string;
  index?: number;
  disabled?: boolean;
  extra?: {
    disabled?: boolean;
    [key: string]: unknown;
  };
}

export interface ConnectionMetadata {
  network: string;
  type: string;
  host: string;
  sourceIP: string;
  sourcePort: string;
  destinationIP: string;
  destinationPort: string;
  dnsMode: string;
  processPath?: string;
  remoteDestination?: string;
  sniffHost?: string;
  inboundUser?: string;
  inboundName?: string;
  inboundPort?: string;
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
  rulePayload: string;
}

export interface ConnectionEntry extends CoreConnectionSnapshot {
  uploadSpeed: number;
  downloadSpeed: number;
}

export interface CoreConnectionsFrame {
  downloadTotal: number;
  uploadTotal: number;
  memory?: number;
  connections: CoreConnectionSnapshot[];
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
