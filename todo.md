# Fresh Box 重构与优化任务清单 (TODO)

这个清单列出了项目中需要重构和优化的关键点，旨在提升代码的可维护性、健壮性和用户体验。

## 🟦 前端重构 (Vue 3 / TypeScript)

### 1. 状态管理优化 (State Management)
- [ ] **引入全局状态管理**：使用 Pinia 或自定义 Reactive Store 接管 `App.vue` 中的全局状态（`isRunning`, `isLoading`, `configFiles`, `subscriptions`）。
- [ ] **消除 Props Drilling**：通过 Store 共享状态，减少 `App.vue` 向 `Config.vue` 和 `Overview.vue` 传递过多 Props 的情况。
- [ ] **统一持久化逻辑 (Storage Consistency)**：废弃前端的 `localStorage`，将所有应用设置迁移到 Rust 后端管理的 JSON 文件中，确保状态的一致性和可靠性。

### 2. 组件拆分与解耦 (Component Refactoring)
- [ ] **瘦身 `App.vue`**：将文件操作逻辑（重命名、删除、订阅更新）移动到 Composable 函数（如 `useConfigs.ts`）。
- [ ] **拆分 `Settings.vue`**：将 700+ 行的代码按功能拆分为子组件：
    - `ConfigOverrideSection.vue`
    - `LogSettingsSection.vue`
    - `ProcessManager.vue`
- [ ] **拆分 `Config.vue`**：
    - `SubscriptionList.vue`
    - `ConfigFileGrid.vue`
- [ ] **全局 Toast 优化**：将 Toast 改为命令式调用（例如 `toast.success('...')`），而不是通过 `ref` 手动调用组件方法。

### 3. 代码质量与规范
- [ ] **提取 Composable 函数**：创建 `useSingbox.ts` 处理进程启动/停止/状态轮询逻辑。
- [ ] **完善类型定义**：为后端返回的 JSON 数据建立严格的 TypeScript Interface，减少 `any` 或弱类型的使用。

---

## 🦀 后端重构 (Rust / Tauri)

### 1. 代码去重 (DRY)
- [ ] **整合 `singbox.rs`**：消除 `_directly` 函数与 Tauri 命令之间的逻辑重复，将核心逻辑下沉到私有 Helper 函数。
- [ ] **抽象 Mutex 处理**：编写宏或 Helper 函数来处理重复的 `lock().unwrap()` 或 `poisoned` 检查逻辑。

### 2. 模块化与结构优化
- [ ] **清理 `main.rs`**：
    - 将 `panic_hook` 逻辑移动到 `errors.rs` 或单独的 `logger.rs`。
    - 将特定业务命令（如 `open_panel_url`）移动到对应的 `config.rs` 模块。
- [ ] **强化错误处理**：引入 `thiserror` 库，为 `CommandError` 提供更清晰的分类 and 错误上下文。

### 3. 功能增强
- [ ] **完善进程生命周期管理**：在应用强制退出或崩溃时，确保能更好地清理残留的 `sing-box` 进程（优化 `cleanup_process`）。

---

## 🎨 UI/UX 增强

- [ ] **样式统一**：全面审查并确保所有组件遵循 Tailwind 4 的设计规范，减少 `assets/styles.css` 中的自定义 CSS。
- [ ] **加载状态平滑化**：优化 Skeleton 屏或加载动画（尤其是在 `Settings.vue` 加载远程配置字段时）。
- [ ] **响应式细节**：检查不同窗口尺寸下的侧边栏显示效果。

---

