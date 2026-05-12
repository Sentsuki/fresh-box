# TODO: 前端逻辑向后端迁移及优化

为了提升应用性能、减少前端复杂度并增强数据一致性，计划将以下前端逻辑迁移至后端（Rust）或进行优化。

## 1. 数据衍生与解析 (Data Derivation & Parsing)
- [ ] **节点国旗 Emoji 解析**
  - **位置**：`src/pages/Proxies/index.tsx`
  - **内容**：将解析节点名称中的国旗 Emoji 并生成图片 URL 的逻辑移至后端。后端直接返回 `country_code` 或 `flag_url`。
- [ ] **日志类别提取**
  - **位置**：`src/hooks/useLogsStream.ts`
  - **内容**：后端在推送日志时，直接发送结构化的 JSON（包含 `time`, `level`, `category`, `message`），避免前端通过正则解析。
- [ ] **连接目标类型判断**
  - **位置**：`src/hooks/useConnectionsStream.ts`
  - **内容**：后端在返回 `ConnectionEntry` 时直接包含 `dest_type` (IPv4/IPv6/FQDN)，避免前端正则判断。

## 2. 状态计算与聚合 (State Calculation & Aggregation)
- [ ] **连接速率 (Speed) 计算**
  - **位置**：`src/hooks/useConnectionsStream.ts`
  - **内容**：由后端（Rust）计算 delta（速率）后推给前端，前端不再维护上一帧状态进行计算。
- [ ] **总量 (Total) 计算**
  - **位置**：`src/hooks/useConnectionsStream.ts`
  - **内容**：总下载速度和总上传速度由后端计算好后随连接列表一同推送。

## 3. 流程编排与事务一致性 (Orchestration & Consistency)
- [ ] **添加/更新订阅流程重构**
  - **位置**：`src/hooks/useConfigs.ts`
  - **内容**：将“请求网络 -> 写入配置 -> 更新订阅列表”的完整流程封装为后端的一个原子命令（如 `add_subscription`），保证一致性。

## 4. 状态同步优化 (State Sync Optimization)
- [ ] **Clash 测速结果合并**
  - **位置**：`src/stores/clashStore.ts`
  - **内容**：重构测速接口，让后端在测速完成后直接返回更新后的 Group 对象或完整的 `ClashOverview`，简化前端状态合并逻辑。

## 5. 潜在 Bug 修复 (Bug Fixes)
- [ ] **日志缓冲区内存泄露修复**
  - **位置**：`src/hooks/useLogsStream.ts`
  - **内容**：修复应用在后台（不可见）时，`logBuffer` 不断堆积导致的内存泄露问题。即使不可见也应清空或限制缓冲区大小。

## 6. 托盘功能优化 (Tray Optimization)
- [ ] **支持“销毁窗口”模式**
  - **位置**：`src-tauri/src/window_utils.rs` 和 `src-tauri/src/tray.rs`
  - **内容**：在托盘点击显示时，如果窗口已被销毁，则动态创建新窗口，以节省后台挂机时的内存占用。
