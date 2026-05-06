export type AppPage =
  | "overview"
  | "proxy"
  | "connections"
  | "logs"
  | "rules"
  | "config"
  | "custom"
  | "settings";
export type SingboxCoreChannel = "stable" | "testing";

export interface SubscriptionInfo {
  url: string;
  lastUpdated?: string;
}

export type SubscriptionRecord = Record<string, SubscriptionInfo>;

export interface ConfigFileEntry {
  path: string;
  displayName: string;
}

export interface AppSettings {
  selected_config: string | null;
  selected_config_display: string | null;
  current_page: AppPage | null;
  active_singbox_core_channel: SingboxCoreChannel | null;
  active_singbox_core_version: string | null;
}

export interface ConfigOverride {
  [key: string]: unknown;
}

export type StackOption = "mixed" | "gvisor" | "system";

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "panic";

export interface LogConfig {
  disabled: boolean;
  level: LogLevel | string;
}

export interface PriorityConfig {
  stack?: string;
  log?: LogConfig;
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
  previous_version: string | null;
  current_version: string;
  latest_version: string;
  restart_required: boolean;
}

export interface CoreUpdateProgressEvent {
  stage: string;
  percent: number;
  message: string;
}

export interface CommandErrorPayload {
  kind?: string;
  message?: string;
}

export interface ClashProxyNode {
  name: string;
  kind: string;
  delay: number | null;
  alive: boolean | null;
  is_selected: boolean;
}

export interface ClashProxyGroup {
  name: string;
  kind: string;
  current: string;
  current_delay: number | null;
  options: ReadonlyArray<ClashProxyNode>;
}

export interface ClashOverview {
  current_mode: string;
  available_modes: ReadonlyArray<string>;
  proxy_groups: ReadonlyArray<ClashProxyGroup>;
}

export interface CoreConnectionMetadata {
  destinationGeoIP: string;
  destinationIP: string;
  destinationIPASN: string;
  destinationPort: string;
  dnsMode: string;
  dscp: number;
  host: string;
  inboundIP: string;
  inboundName: string;
  inboundPort: string;
  inboundUser: string;
  network: string;
  process: string;
  processPath: string;
  remoteDestination: string;
  sniffHost: string;
  sourceGeoIP: string;
  sourceIP: string;
  sourceIPASN: string;
  sourcePort: string;
  specialProxy: string;
  specialRules: string;
  type: string;
  uid: number;
  smartBlock: string;
}

export interface CoreConnectionSnapshot {
  id: string;
  download: number;
  upload: number;
  chains: ReadonlyArray<string>;
  rule: string;
  rulePayload: string;
  start: string;
  metadata: CoreConnectionMetadata;
}

export interface CoreConnectionsFrame {
  connections: CoreConnectionSnapshot[];
  downloadTotal: number;
  uploadTotal: number;
  memory?: number;
}

export interface ConnectionEntry extends CoreConnectionSnapshot {
  downloadSpeed: number;
  uploadSpeed: number;
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

export interface RuleExtraInfo {
  disabled?: boolean;
  hitAt?: string;
  hitCount?: number;
  missAt?: string;
  missCount?: number;
}

export interface RuleEntry {
  type: string;
  payload: string;
  proxy: string;
  size?: number;
  uuid?: string;
  disabled?: boolean;
  index?: number;
  extra?: RuleExtraInfo;
}

export interface RuleProviderEntry {
  behavior: string;
  format: string;
  name: string;
  ruleCount: number;
  type: string;
  updatedAt: string;
  vehicleType: string;
}

export interface ClashRulesSnapshot {
  rules: ReadonlyArray<RuleEntry>;
  providers: ReadonlyArray<RuleProviderEntry>;
}
