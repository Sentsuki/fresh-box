# Logs 页面功能增强待办事项

从 Zashboard 借鉴的日志页面功能改进计划。

## 1. 倒序排列 (Reverse Chronological Order)
- [ ] 修改日志存储或渲染逻辑，使最新日志显示在顶部。
- [ ] 调整虚拟滚动器，确保新日志到达时，如果用户没有滚动查看历史，视口能保持在最新日志（顶部）。

## 2. 正则搜索 (Regex Search)
- [ ] 增强 `useLogsStream.ts` 中的 `matchesSearch` 函数，支持正则表达式匹配。
- [ ] 优化错误处理，防止用户输入非法的正则表达式导致应用崩溃。
- [ ] 在 `Logs/index.tsx` 的搜索框占位符中提示支持正则（例如："搜索日志... (支持正则)"）。

## 3. 反向过滤 (Negative Filter / Hide Logs)
- [ ] 在 `settingsStore` 中添加 `hideLogRegex` (字符串) 和 `hideLogEnabled` (布尔值) 的持久化配置。
- [ ] 在 `useLogsStream.ts` 的过滤逻辑中，增加对匹配 `hideLogRegex` 的日志的排除逻辑。
- [ ] 在 `Logs/index.tsx` 页面上添加：
  - [ ] 一个用于输入排除正则的输入框。
  - [ ] 一个用于快速启用/禁用反向过滤的开关或按钮。

## 4. 动态字典 (Dynamic Dictionary)
- [ ] 改变目前固定的 `LOG_LEVELS` 过滤方式。
- [ ] 在 `useLogsStream.ts` 中，动态遍历当前日志列表，提取出所有出现过的 `category`（模块分类）和 `type`（日志级别）。
- [ ] 更新 `Logs/index.tsx` 的筛选 UI，将原本的分段控制或下拉框改为按“级别”和“模块”分组的动态字典。
