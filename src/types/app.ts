export type AppPage = "overview" | "config" | "custom" | "settings";

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

export interface SingboxCoreStatus {
  installed: boolean;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  is_running: boolean;
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
