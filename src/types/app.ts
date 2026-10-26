// 前端自己的视图模型与常量。
//
// 跨 IPC 的 host 域类型**不在这里** —— 它们由 Rust 生成（`src/gen/host.ts`，
// 见 `src-tauri/src/ipc.rs`），这里只做重导出，让调用点的 import 路径不用改。
// daemon 域的类型同理，由 protobuf 生成（`src/gen/daemon/`、`src/gen/boxdd/`）。
//
// 阶段 5 之前这个文件里有一份手抄的镜像：Rust 改个字段名，这边不会有任何编译
// 错误，运行时表现是那个字段恒为 `undefined`。

export type {
  ConfigFieldsCheck,
  PriorityConfig,
  ProfileOperationResult,
  ReportFileView,
  ReportSummary,
} from "../gen/host";

/** Rust 侧叫 `Profile`；前端一直用 `ProfileEntry` 这个名字。 */
export type { Profile as ProfileEntry } from "../gen/host";

import * as v from "valibot";
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
  app: Omit<Required<Host.AppConfig>, "current_page"> & {
    current_page: AppPage;
  };
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
/**
 * sing-box 的日志级别，从最详细到最严重。配置里的 `log.level`、日志条目的
 * `type`、日志页的筛选按钮都用这一套名字 —— 以前三处各写一份，WARN 一边叫
 * "warn" 一边叫 "warning"，按级别筛选就筛不出警告。
 */
export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "panic",
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

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

const APP_PAGES: readonly AppPage[] = [
  "overview",
  "proxy",
  "connections",
  "logs",
  "profiles",
  "advanced",
  "settings",
];
const CONNECTION_TABS: readonly ConnectionPageTab[] = ["active", "closed"];
const SORT_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];
const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];

function isColumnKey(value: unknown): value is ConnectionColumnKey {
  return (
    typeof value === "string" &&
    (DEFAULT_CONNECTION_COLUMN_ORDER as readonly string[]).includes(value)
  );
}

// ── 设置的 schema ───────────────────────────────────────────────────────
//
// Rust 侧这些字段多是 `String`/`Vec<String>`（存储层不该知道有哪些页面、哪些
// 列），所以「上个版本写下的页名」「被手改过的值」在类型上完全合法，只能在这
// 里挡住。规则统一是：认识的值原样留下，缺失或不认识的退回默认 —— 默认值也
// 只在这里写一份，`createDefaultAppSettings()` 就是对空对象跑一遍 schema。

/** 枚举字段：不认识的值（上个版本的页名、手改坏的值）退回默认，而不是透传。 */
function oneOf<T extends string>(allowed: readonly T[], fallback: T) {
  return v.fallback(v.picklist(allowed), fallback);
}

/** 键值表：值类型不对的条目单独丢掉，其余的保留；整个不是对象就是空表。 */
function recordOf<T>(value: v.GenericSchema<T>) {
  return v.pipe(
    v.unknown(),
    v.transform((input): Record<string, T> =>
      input && typeof input === "object" && !Array.isArray(input)
        ? Object.fromEntries(
            Object.entries(input).filter(([, item]) => v.is(value, item)),
          )
        : {},
    ),
  );
}

/**
 * 列名列表：剔掉坏的和重复的。只有字段整个缺失（从没设置过）才用默认 ——
 * 空数组是用户「一列都不显示」的选择，必须保留。
 */
function columnList(whenMissing: () => ConnectionColumnKey[]) {
  return v.optional(
    v.pipe(
      v.unknown(),
      v.transform((input): ConnectionColumnKey[] =>
        Array.isArray(input) ? [...new Set(input.filter(isColumnKey))] : [],
      ),
    ),
    whenMissing,
  );
}

/**
 * 一个设置区（顶层的整份设置也是）。整个区缺失（旧版本写下的记录还没有这个
 * 区）或者不是对象时按空对象处理，于是每个字段各自退回默认，不会留下
 * `undefined`。
 *
 * 先把已知字段都补出来再交给 `v.object`：它会先检查字段在不在，缺了直接报错，
 * 根本轮不到字段自己的 `fallback`。补出来的值是 `undefined`，`columnList` 的
 * 「缺失才用默认」看的正是它。
 */
function section<const E extends v.ObjectEntries>(entries: E) {
  const schema = v.object(entries);
  return v.pipe(
    v.unknown(),
    v.transform((input) => {
      const source = (
        input && typeof input === "object" ? input : {}
      ) as Record<string, unknown>;
      return v.parse(
        schema,
        Object.fromEntries(Object.keys(entries).map((k) => [k, source[k]])),
      );
    }),
  );
}

const appSettingsSchema = section({
  app: section({
    current_page: oneOf(APP_PAGES, "overview"),
  }),
  proxies: section({
    collapsed_groups: recordOf(v.boolean()),
  }),
  connections: section({
    current_tab: oneOf(CONNECTION_TABS, "active"),
    visible_columns: columnList(() => [...DEFAULT_CONNECTION_VISIBLE_COLUMNS]),
    pinned_columns: columnList(() => []),
    sort_key: oneOf(DEFAULT_CONNECTION_COLUMN_ORDER, "downloadSpeed"),
    sort_direction: oneOf(SORT_DIRECTIONS, "desc"),
    // Rust 侧「没有分组」存的是空串；前端用 null。认不出的列名也是 null ——
    // 以前它会被「纠正」成 `downloadSpeed`，而那一列根本不能分组。
    grouped_column: v.pipe(
      v.unknown(),
      v.transform((input) => (isColumnKey(input) ? input : null)),
    ),
    column_sizes: recordOf(v.number()),
  }),
  logs: section({
    type_filter: v.fallback(v.string(), ""),
  }),
  profiles: section({
    selected_profile_id: v.fallback(v.nullable(v.string()), null),
  }),
  settings: section({
    theme_mode: oneOf(THEME_MODES, "system"),
    auto_close_connections: v.fallback(v.boolean(), true),
    exit_reminder_minutes: v.fallback(v.number(), 30),
  }),
  updates: section({
    check_update_enabled: v.fallback(v.boolean(), false),
    update_check_prompted: v.fallback(v.boolean(), false),
    last_shown_update_version: v.fallback(v.string(), ""),
  }),
  diagnostics: section({
    oom_killer_enabled: v.fallback(v.boolean(), false),
    oom_memory_limit_mb: v.fallback(v.number(), 200),
    power_report_enabled: v.fallback(v.boolean(), false),
  }),
});

export function createDefaultAppSettings(): AppSettings {
  return v.parse(appSettingsSchema, {});
}

/**
 * 把 Rust 传回来的（各字段可选的）设置补齐成前端用的全必填形状。
 *
 * 入参是**生成的** `Host.AppSettings`，出参是本文件里那个窄化过的
 * `AppSettings` —— 这个函数就是两者之间唯一的转换点。
 */
export function normalizeAppSettings(
  settings: Host.AppSettings | null | undefined,
): AppSettings {
  return v.parse(appSettingsSchema, settings ?? {});
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

interface ConnectionMetadata {
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

interface CoreConnectionSnapshot {
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

interface CoreLogMessage {
  type: LogLevel;
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
