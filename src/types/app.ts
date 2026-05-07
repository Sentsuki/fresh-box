export type ThemeMode = "light" | "dark" | "system";

export type AppPage =
  | "overview"
  | "proxy"
  | "connections"
  | "logs"
  | "rules"
  | "profiles"
  | "custom"
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
  | "start";
export type RulesTab = "rules" | "providers";
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
  column_order: ConnectionColumnKey[];
  visible_columns: ConnectionColumnKey[];
  sort_key: ConnectionColumnKey;
  sort_direction: SortDirection;
  grouped_column: ConnectionColumnKey | null;
  collapsed_groups: Record<string, boolean>;
}

export interface LogsPageSettings {
  log_level: LogLevel;
  type_filter: string;
}

export interface RulesPageSettings {
  current_tab: RulesTab;
}

export interface AppSettings {
  schema_version: number;
  app: AppConfig;
  proxies: ProxyPageSettings;
  connections: ConnectionPageSettings;
  logs: LogsPageSettings;
  rules: RulesPageSettings;
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
];

export const DEFAULT_CONNECTION_VISIBLE_COLUMNS: ConnectionColumnKey[] = [
  "host",
  "downloadSpeed",
  "uploadSpeed",
  "chain",
  "rule",
  "source",
  "process",
  "start",
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
      column_order: [...DEFAULT_CONNECTION_COLUMN_ORDER],
      visible_columns: [...DEFAULT_CONNECTION_VISIBLE_COLUMNS],
      sort_key: "downloadSpeed",
      sort_direction: "desc",
      grouped_column: null,
      collapsed_groups: {},
    },
    logs: {
      log_level: "info",
      type_filter: "",
    },
    rules: {
      current_tab: "rules",
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
  "custom",
  "settings",
];
const CONNECTION_TABS: ConnectionPageTab[] = ["active", "closed"];
const CONNECTION_COLUMNS = new Set<ConnectionColumnKey>(
  DEFAULT_CONNECTION_COLUMN_ORDER,
);
const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];
const RULES_TABS: RulesTab[] = ["rules", "providers"];
const LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
];

function normalizeColumnList(
  value: unknown,
  fallback: ConnectionColumnKey[],
): ConnectionColumnKey[] {
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

  for (const key of fallback) {
    if (seen.has(key)) continue;
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

export function normalizeAppSettings(
  settings: AppSettings | null | undefined,
): AppSettings {
  const defaults = createDefaultAppSettings();
  if (!settings) return defaults;

  const columnOrder = normalizeColumnList(
    settings.connections?.column_order,
    DEFAULT_CONNECTION_COLUMN_ORDER,
  );
  const visibleColumns = normalizeColumnList(
    settings.connections?.visible_columns,
    DEFAULT_CONNECTION_VISIBLE_COLUMNS,
  ).filter((key) => columnOrder.includes(key));

  return {
    schema_version:
      typeof settings.schema_version === "number"
        ? settings.schema_version
        : 1,
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
      current_tab: CONNECTION_TABS.includes(
        settings.connections?.current_tab,
      )
        ? settings.connections.current_tab
        : defaults.connections.current_tab,
      column_order: columnOrder,
      visible_columns:
        visibleColumns.length > 0
          ? visibleColumns
          : [...DEFAULT_CONNECTION_VISIBLE_COLUMNS],
      sort_key: CONNECTION_COLUMNS.has(
        settings.connections?.sort_key,
      )
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
      collapsed_groups: normalizeBooleanRecord(
        settings.connections?.collapsed_groups,
      ),
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
    Profiles: {
      selected_config_path: settings.Profiles?.selected_config_path ?? null,
      selected_config_display: settings.Profiles?.selected_config_display ?? null,
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

export interface PriorityConfig {
  stack?: string;
  log?: LogConfig;
  clash_api?: ClashApiConfig;
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

export interface SingboxCoreStatus {
  installed: boolean;
  current_channel: SingboxCoreChannel | null;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  is_running: boolean;
  available_options: SingboxCoreOption[];
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
  providers: RuleProviderEntry[];
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

export interface RuleProviderEntry {
  name: string;
  behavior: string;
  vehicleType: string;
  type: string;
  ruleCount?: number;
  updatedAt?: string;
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
