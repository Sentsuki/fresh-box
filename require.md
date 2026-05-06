# Fresh Box 前端重写需求文档

> **目标**：从零重写前端，使用 React 19 + Tailwind CSS v4 + Fluent UI v9，实现接近原生 WinUI 3 观感的桌面应用界面，彻底解决迁移遗留的代码混乱与卡顿问题。

---

## 一、技术栈确认

| 层级 | 选型 | 说明 |
|------|------|------|
| UI 框架 | React 19 | 已有，保留 |
| 样式系统 | Tailwind CSS v4 | 已有，重新规范使用方式 |
| 组件库 | `@fluentui/react-components` v9 | 已有，作为底层控件来源 |
| 图标库 | `@fluentui/react-icons` v2 | 已有，保留 |
| 状态管理 | Zustand v5 | 已有，重构 Store 设计 |
| 构建工具 | Vite | 已有，保留 |
| 类型系统 | TypeScript strict | 已有，全面强化 |
| 路由 | 无路由库（页面切换用 Zustand 状态）| 轻量方案，无需引入 react-router |

### 关于 FluentUI 与 Tailwind 的协作原则

- **FluentUI 负责**：交互控件（Button、Dialog、Dropdown、Badge、Tooltip、Spinner 等）、Design Token（颜色、字体、圆角、阴影）、可访问性（a11y）
- **Tailwind 负责**：布局（flex/grid/gap/padding）、尺寸、背景颜色（使用 CSS 变量桥接 Fluent Token）、响应式工具类
- **禁止**：在 Tailwind 中硬编码颜色值（如 `bg-neutral-800`），必须通过 `var(--colorNeutral*)` 等 Fluent Token 或自定义 CSS 变量使用
- **不使用** FluentUI 的 `makeStyles` / `shorthands`，统一改用 Tailwind 工具类 + CSS 变量

---

## 二、WinUI 3 视觉设计规范

### 2.1 颜色系统（Mica/Acrylic 风格）

```css
/* src/styles/winui-tokens.css */
:root {
  /* 主题：深色（跟随系统）*/
  --wb-surface-base: rgba(32, 32, 32, 0.85);      /* 背景主体，Mica 效果 */
  --wb-surface-layer: rgba(40, 40, 40, 0.72);     /* 卡片层 */
  --wb-surface-flyout: rgba(44, 44, 44, 0.96);    /* 弹出层 / Acrylic */
  --wb-surface-hover: rgba(255, 255, 255, 0.06);  /* hover 态 */
  --wb-surface-active: rgba(255, 255, 255, 0.08); /* pressed 态 */
  --wb-surface-selected: rgba(255, 255, 255, 0.06);

  --wb-border-subtle: rgba(255, 255, 255, 0.08);
  --wb-border-default: rgba(255, 255, 255, 0.12);

  --wb-accent: #60CDFF;          /* Windows 蓝，Fluent accent */
  --wb-accent-hover: #8CD7FF;
  --wb-accent-pressed: #4DC8FF;

  --wb-text-primary: rgba(255, 255, 255, 0.95);
  --wb-text-secondary: rgba(255, 255, 255, 0.60);
  --wb-text-tertiary: rgba(255, 255, 255, 0.40);
  --wb-text-disabled: rgba(255, 255, 255, 0.28);

  --wb-sidebar-width: 240px;
  --wb-titlebar-height: 36px;    /* Tauri 自定义标题栏高度 */
  --wb-radius-sm: 4px;
  --wb-radius-md: 6px;
  --wb-radius-lg: 8px;
}
```

### 2.2 字体

```css
body {
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
  font-feature-settings: "kern" 1, "liga" 1;
  -webkit-font-smoothing: antialiased;
}
```

### 2.3 动画约定

| 场景 | 规范 |
|------|------|
| 页面切换（侧边栏导航）| `opacity 0.15s ease + translateX 8px` |
| 列表项挂载 | `staggered opacity 0.1s`，最多 10 项参与动画 |
| 卡片/弹窗出现 | `scale(0.97) → scale(1) + opacity`，120ms |
| Hover 态 | `background 0.1s ease` |
| 禁止大量使用 `transition: all` | 只对需要的属性声明 transition |

### 2.4 WinUI 3 控件映射

| 原生 WinUI 控件 | 实现方案 |
|------|------|
| NavigationView | 自定义 `<Sidebar>` + FluentUI `NavDrawer` token |
| TitleBar | 自定义 `<TitleBar>` 利用 Tauri window decoration |
| InfoBar | FluentUI `<MessageBar>` |
| ProgressRing | FluentUI `<Spinner>` |
| ComboBox | FluentUI `<Dropdown>` / `<Select>` |
| ToggleSwitch | FluentUI `<Switch>` |
| Expander | FluentUI `<AccordionItem>` |
| DataGrid | 自研虚拟列表（见性能规范） |
| TeachingTip / Toast | FluentUI `<Toaster>` + `useToastController` |

---

## 三、目录结构

```
src/
├── main.tsx                    # 入口，挂载 FluentProvider
├── App.tsx                     # 根组件（布局骨架）
├── styles/
│   ├── index.css               # Tailwind v4 入口（@import "tailwindcss"）
│   └── winui-tokens.css        # 自定义 CSS 变量（上节定义）
│
├── components/                 # 纯 UI 展示组件（无业务逻辑）
│   ├── layout/
│   │   ├── TitleBar.tsx        # 自定义标题栏（含窗口控制按钮）
│   │   ├── Sidebar.tsx         # 左侧导航栏
│   │   └── PageTransition.tsx  # 页面切换动画包装
│   ├── ui/                     # 通用 UI 基元（对 FluentUI 的薄封装）
│   │   ├── Card.tsx            # 卡片容器
│   │   ├── Section.tsx         # 分组标题 + 内容区
│   │   ├── StatusBadge.tsx     # 运行状态徽章
│   │   ├── KeyValue.tsx        # 键值对展示行
│   │   └── VirtualTable.tsx    # 高性能虚拟滚动表格
│   └── global/
│       ├── GlobalToaster.tsx   # 全局 Toast（FluentUI Toaster）
│       └── ErrorBoundary.tsx   # 错误边界
│
├── pages/                      # 页面级组件（对应各导航项）
│   ├── Overview/
│   │   ├── index.tsx
│   │   ├── TrafficChart.tsx
│   │   └── StatusCards.tsx
│   ├── Proxies/
│   │   ├── index.tsx
│   │   ├── ProxyGroup.tsx
│   │   └── ProxyCard.tsx
│   ├── Connections/
│   │   ├── index.tsx
│   │   └── ConnectionRow.tsx
│   ├── Logs/
│   │   ├── index.tsx
│   │   └── LogEntry.tsx
│   ├── Rules/
│   │   ├── index.tsx
│   │   └── RuleRow.tsx
│   ├── Config/
│   │   ├── index.tsx
│   │   ├── ConfigFileGrid.tsx
│   │   └── SubscriptionPanel.tsx
│   ├── Custom/
│   │   └── index.tsx           # 优先级配置 / 覆写规则
│   └── Settings/
│       ├── index.tsx
│       ├── CoreManager.tsx
│       └── GeneralSettings.tsx
│
├── stores/                     # Zustand 状态（按领域拆分）
│   ├── appStore.ts             # 全局应用状态（页面、初始化）
│   ├── settingsStore.ts        # 用户设置持久化
│   ├── singboxStore.ts         # Sing-box 进程状态
│   ├── clashStore.ts           # Clash API 实时数据（代理/连接/规则）
│   └── configStore.ts          # 配置文件列表 & 订阅
│
├── hooks/                      # 业务 Hook（副作用、异步操作）
│   ├── useInit.ts              # 应用启动初始化序列
│   ├── useSingbox.ts           # 启停控制、状态轮询
│   ├── useConfigs.ts           # 配置文件增删改查
│   ├── useClash.ts             # Clash API 读写
│   ├── useConnectionsStream.ts # WebSocket 实时连接流
│   ├── useLogsStream.ts        # WebSocket 实时日志流
│   ├── useRules.ts             # 规则页逻辑
│   └── useToast.ts             # Toast 快捷方法
│
├── services/                   # 纯函数，无副作用，无状态
│   ├── tauri.ts                # invokeCommand 封装
│   ├── api.ts                  # 所有 Tauri command 调用（保持现有）
│   └── utils.ts                # 通用工具函数
│
└── types/
    └── app.ts                  # 所有业务类型定义（保持现有）
```

---

## 四、状态管理重构

### 4.1 Store 拆分原则

当前问题：`appStore.ts` 将所有状态混在一起（设置、进程状态、配置列表、UI 状态），导致任意状态变化都触发大量无关组件重渲染。

**新方案**：按领域拆分，每个 Store 只暴露自己领域的状态。

```typescript
// stores/singboxStore.ts — 只管进程状态
interface SingboxState {
  isRunning: boolean;
  status: string;
  pendingOperation: boolean; // 替换 pendingOperations 计数器
}

// stores/clashStore.ts — 只管 Clash API 数据
interface ClashState {
  overview: ClashOverview | null;
  proxies: ProxyGroup[];
  // 连接和日志流数据不放这里，放 hook 内部局部状态
}

// stores/configStore.ts — 只管配置文件和订阅
interface ConfigState {
  configFiles: ConfigFileEntry[];
  subscriptions: SubscriptionRecord;
}

// stores/settingsStore.ts — 用户设置
interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  updateSettings: (updater: (s: AppSettings) => void) => Promise<void>;
}

// stores/appStore.ts — 极简，只管 UI 导航状态
interface AppState {
  currentPage: AppPage;
  initialized: boolean;
  setCurrentPage: (page: AppPage) => void;
  markInitialized: () => void;
}
```

### 4.2 选择器约束（防止过度渲染）

```typescript
// ✅ 正确：精确订阅单个字段
const isRunning = useSingboxStore((s) => s.isRunning);

// ❌ 错误：订阅整个 store 对象
const store = useSingboxStore();
```

所有组件必须使用细粒度选择器，禁止整体订阅 store。

### 4.3 异步操作约定

- 所有异步操作写在 **Hook** 中，不要写在 Store action 中
- Store action 只做同步状态更新（set）
- Hook 负责：调用 service → 更新 store → 处理错误 → 触发 toast

```typescript
// hooks/useSingbox.ts
export function useSingbox() {
  const setRunning = useSingboxStore((s) => s.setRunning);
  const setPending = useSingboxStore((s) => s.setPending);
  const { toast } = useToast();

  const start = useCallback(async (configPath: string) => {
    setPending(true);
    try {
      await api.startSingbox(configPath);
      setRunning(true);
    } catch (e) {
      toast.error("启动失败", String(e));
    } finally {
      setPending(false);
    }
  }, []);

  return { start, stop };
}
```

---

## 五、性能规范

### 5.1 虚拟滚动（Connections / Logs 页面卡顿根因）

**问题**：Connections 和 Logs 页面存在大量 DOM 节点渲染。

**方案**：实现 `<VirtualTable>` 和 `<VirtualList>` 组件，使用原生 CSS containment + 手写虚拟滚动（不引入 `react-window`/`react-virtual`，减少包体积）。

```typescript
// components/ui/VirtualTable.tsx
// 核心思路：
// 1. 测量容器高度，计算可见行数
// 2. 只渲染 [startIndex, endIndex] 范围内的行
// 3. 顶部/底部用 spacer div 占位
// 4. 使用 scrollTop 监听更新可视范围（使用 useRef 避免 state 更新）
```

**关键**：scroll 事件处理必须用 `passive: true`，节流 16ms（1帧）。

### 5.2 流数据处理（Connections / Logs WebSocket）

- WebSocket 数据进入后不直接 setState，先写入 `ref` 缓冲区
- 使用 `requestAnimationFrame` 批量 flush 到渲染状态
- Connections 数据最多保留最近 1000 条，Logs 最多 2000 条（用循环缓冲区）
- 连接断开后立即清空缓冲区

```typescript
// hooks/useLogsStream.ts 示例
const buffer = useRef<LogEntry[]>([]);
const [logs, setLogs] = useState<LogEntry[]>([]);

// WebSocket onmessage
ws.onmessage = (e) => {
  buffer.current.push(JSON.parse(e.data));
};

// rAF flush
useEffect(() => {
  let rafId: number;
  const flush = () => {
    if (buffer.current.length > 0) {
      const batch = buffer.current.splice(0);
      setLogs(prev => {
        const next = [...prev, ...batch];
        return next.length > 2000 ? next.slice(-2000) : next;
      });
    }
    rafId = requestAnimationFrame(flush);
  };
  rafId = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(rafId);
}, []);
```

### 5.3 React 渲染优化

| 规则 | 说明 |
|------|------|
| 列表子项必须 `React.memo` | 避免父组件数据更新触发全量子项重渲染 |
| 行级回调必须 `useCallback` | Connections / Logs 中的 onClick 等 |
| 避免在 JSX 中创建对象/数组字面量 | 改用 `useMemo` 或模块级常量 |
| 页面组件懒加载 | 保持现有 `React.lazy` 模式 |
| 禁止在渲染路径中执行 `JSON.parse` | 提前在 Hook 中处理好数据 |

### 5.4 Tauri 调用优化

- 对于频繁轮询的 command（如 `is_singbox_running`），使用 Tauri Event 系统替代轮询
- 优先使用后端推送（`emit`）而非前端拉取（`invoke`）
- 批量操作使用队列排队，避免并发 invoke 过多

---

## 六、布局架构

### 6.1 整体骨架

```
┌─────────────────────────────────────────────┐
│  TitleBar（36px，含窗口控制，drag region）    │  ← data-tauri-drag-region
├──────────────┬──────────────────────────────┤
│              │                              │
│   Sidebar    │      Page Content Area       │
│   (240px)    │      (flex-1, overflow-auto) │
│              │                              │
│              │                              │
└──────────────┴──────────────────────────────┘
```

### 6.2 TitleBar 组件

```tsx
// components/layout/TitleBar.tsx
// 要点：
// - data-tauri-drag-region 覆盖整个 titlebar 区域
// - 右侧窗口按钮（最小化/最大化/关闭）使用 Tauri window API
// - 高度固定 36px，与 Windows 标准对齐
// - 包含应用名称 + 当前页面标题（可选）
```

### 6.3 Sidebar

```tsx
// components/layout/Sidebar.tsx
// - 宽度 240px，固定，无折叠（桌面应用无需响应式折叠）
// - 顶部：应用 Logo + 名称
// - 中部：导航项列表（FluentUI NavDrawer token 风格）
// - 底部：运行状态指示器（isRunning badge）+ Settings 入口
// - 激活项：左侧 2px accent 竖线 + 轻微背景高亮（WinUI NavigationViewItem 效果）
```

### 6.4 页面内布局

- 页面顶部统一 `<PageHeader>` 组件：含页面标题 + 右侧操作按钮区
- 内容区使用 `overflow-y-auto`，不在父容器上设置 overflow
- 使用 `scroll-behavior: auto`（禁止 smooth scroll，性能更好）

---

## 七、各页面重构要点

### Overview 页面
- 使用 CSS Grid 布局状态卡片（流量、连接数、延迟等）
- 流量图表用 Canvas 手写（避免引入 Recharts/Chart.js 等大库）
- 实时数据由 Tauri Event 推送，不轮询

### Proxies 页面
- 代理组使用 `<AccordionItem>` 展开/折叠（替代当前的自定义折叠逻辑）
- 代理节点卡片：延迟测试结果用颜色条（绿/黄/红）直观展示
- 延迟测试按钮触发后使用 optimistic update 立即反馈

### Connections 页面
- **核心重点**：必须使用 VirtualTable，当前实现是卡顿主因
- 列宽可拖拽调整（使用 CSS resize 或 pointer events 实现）
- 列显示/隐藏设置持久化到 settingsStore

### Logs 页面
- **核心重点**：使用 VirtualList + rAF flush 缓冲
- 日志级别颜色编码（error=红，warn=黄，info=白，debug=灰）
- 支持关键词高亮过滤（纯前端过滤，不触发重新订阅）

### Rules 页面
- 规则列表使用 VirtualTable
- 分 Tab：规则列表 / 规则集（使用 FluentUI TabList）

### Config 页面
- 配置文件用 Grid 卡片展示
- 当前激活配置有视觉高亮（accent border）
- 支持拖拽排序（可选，后续迭代）

### Settings 页面
- 分组展示（常规、核心管理、关于）
- 使用 FluentUI `<Switch>` 替代所有自定义开关

---

## 八、错误处理规范

### 8.1 统一 Toast 系统

使用 FluentUI `useToastController` 封装 `useToast` hook：

```typescript
// hooks/useToast.ts
export function useToast() {
  const { dispatchToast } = useToastController("global");
  return {
    success: (title: string, body?: string) => dispatchToast(
      <Toast><ToastTitle>{title}</ToastTitle>{body && <ToastBody>{body}</ToastBody>}</Toast>,
      { intent: "success", timeout: 3000 }
    ),
    error: (title: string, body?: string) => dispatchToast(..., { intent: "error" }),
    info: (title: string, body?: string) => dispatchToast(..., { intent: "info" }),
    warning: (title: string, body?: string) => dispatchToast(..., { intent: "warning" }),
  };
}
```

### 8.2 Tauri Command 错误处理

```typescript
// services/tauri.ts
export async function invokeCommand<T>(cmd: string, args?: object): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    // 统一转为 Error 对象，不直接暴露 Rust 错误字符串
    throw new AppError(cmd, String(e));
  }
}
```

### 8.3 ErrorBoundary

每个页面包裹 `<ErrorBoundary>`，防止单页崩溃影响整个应用。

---

## 九、迁移策略（执行顺序）

> 按此顺序执行，保证每阶段都有可运行的状态。

### Phase 1：基础设施（Day 1）
- [ ] 新建 `src/styles/winui-tokens.css`，定义全部 CSS 变量
- [ ] 修改 `src/styles/index.css`，引入 Tailwind v4 + tokens
- [ ] 修改 `main.tsx`：配置 `FluentProvider` 使用 `webDarkTheme` + 自定义 token 覆盖
- [ ] 新建 `components/layout/TitleBar.tsx`
- [ ] 新建 `components/ui/Card.tsx`、`Section.tsx` 等基础组件
- [ ] 新建 `components/global/ErrorBoundary.tsx`

### Phase 2：状态管理重构（Day 1-2）
- [ ] 拆分 `appStore.ts` → `appStore` + `settingsStore` + `singboxStore` + `clashStore` + `configStore`
- [ ] 迁移现有 hooks 到新 store 结构（逐个文件，不并行）
- [ ] 确保 `useInit.ts` 能正确初始化所有 store

### Phase 3：布局骨架（Day 2）
- [ ] 重写 `App.tsx` 布局（TitleBar + Sidebar + Content）
- [ ] 重写 `Sidebar.tsx`（WinUI NavigationView 风格）
- [ ] 新建 `PageTransition.tsx` 动画包装

### Phase 4：高优先级页面（Day 3-4）
- [ ] 重写 `Connections` 页面（VirtualTable + WebSocket 优化）
- [ ] 重写 `Logs` 页面（VirtualList + rAF flush）
- [ ] 重写 `Overview` 页面

### Phase 5：其余页面（Day 5-6）
- [ ] 重写 `Proxies` 页面
- [ ] 重写 `Rules` 页面
- [ ] 重写 `Config` 页面
- [ ] 重写 `Custom` 页面
- [ ] 重写 `Settings` 页面

### Phase 6：打磨（Day 7）
- [ ] 全局动画一致性审查
- [ ] 深色模式 token 核对
- [ ] 性能 Profile（DevTools Profiler）
- [ ] 修复所有 TypeScript strict 错误

---

## 十、禁止事项（Anti-Patterns）

| 禁止 | 原因 |
|------|------|
| 在 JSX render 中使用 `makeStyles` hook | 每次渲染重新创建样式对象，严重影响性能 |
| 在 Store action 中 `await` 多个 invoke | 异步副作用应在 Hook 中处理 |
| 整体订阅 store（`const s = useStore()`）| 导致任意字段变化都触发重渲染 |
| 在 Connections/Logs 中直接 `setState` 每条消息 | 必须使用 rAF 批量更新 |
| 使用 `transition: all` | 性能浪费，按需声明 |
| 使用 `JSON.parse` 在渲染路径中 | 提前解析，缓存结果 |
| 引入 Recharts / Chart.js 等大型图表库 | 用 Canvas API 手写，控制包体积 |
| 混用 `makeStyles` 和 Tailwind 类名 | 统一使用 Tailwind + CSS 变量 |

---

## 附录 A：FluentProvider 配置示例

```tsx
// main.tsx
import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

const customTheme = {
  ...webDarkTheme,
  // 覆盖圆角，使其更贴近 WinUI 3
  borderRadiusMedium: "6px",
  borderRadiusLarge: "8px",
  fontFamilyBase: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
};

createRoot(document.getElementById("root")!).render(
  <FluentProvider theme={customTheme}>
    <App />
  </FluentProvider>
);
```

## 附录 B：Tailwind v4 + Fluent Token 桥接示例

```css
/* src/styles/index.css */
@import "tailwindcss";
@import "./winui-tokens.css";

/* 将 CSS 变量暴露为 Tailwind 工具类 */
@theme {
  --color-wb-surface-base: var(--wb-surface-base);
  --color-wb-surface-layer: var(--wb-surface-layer);
  --color-wb-accent: var(--wb-accent);
  --color-wb-border: var(--wb-border-default);
  --color-wb-text: var(--wb-text-primary);
  --color-wb-text-muted: var(--wb-text-secondary);
}
```

```tsx
// 使用示例
<div className="bg-[var(--wb-surface-layer)] border border-[var(--wb-border-default)] rounded-lg p-4">
  <span className="text-[var(--wb-text-secondary)]">副标题</span>
</div>
```

## 附录 C：VirtualTable 接口设计

```typescript
interface Column<T> {
  key: keyof T;
  header: string;
  width: number;           // px，可拖拽调整
  minWidth?: number;
  render?: (value: T[keyof T], row: T) => ReactNode;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowHeight: number;       // 固定行高（必须），如 40px
  estimatedHeight?: number; // 容器高度估算
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  getRowClass?: (row: T) => string;
}
```
