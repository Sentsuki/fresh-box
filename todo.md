# TODO List

## Connections 页面优化
- [ ] **重构 Connections 表格为完全虚拟化**
  - 彻底移除不带虚拟滚动的 `GroupedTable` 组件。
  - 参考 `zashboard` 的实现，不再手动维护分组状态，而是利用 TanStack Table 的 `getGroupedRowModel` 和 `getExpandedRowModel` 插件来统一处理分组和展开。
  - 将 TanStack Table 算好的扁平化行模型直接交给 `@tanstack/react-virtual`，实现**无论分不分组，整个表格始终保持完全虚拟化**，彻底解决海量数据下的卡顿问题。

