# 全站虚拟化统一重构待办事项 (Todo List)

这个待办事项列表旨在指导你将项目中的 `Connections`、`Logs`、`Rules` 以及 `Proxies` 页面进行重构，以获得更好的性能、更丰富的功能和统一的技术栈。

---

## 📦 步骤 1：安装依赖

- [ ] 安装 TanStack 家族库 （包管理用 pnpm）

---

## 🌐 步骤 2：Connections 页面重构 (高优先级)

目标：还原 `zashboard` 的高级表格交互。

- [ ] **文件结构拆分**
  - [ ] 在 `src/pages/Connections/` 目录下拆分出 `ConnectionTable.tsx` 和 `ConnectionCtrl.tsx`。
- [ ] **实现高级表格特性 (基于 TanStack Table & Virtual)**
  - [ ] 支持 **列钉住 (Pinning)**（如固定 Host 列）。
  - [ ] 支持 **列宽调整 (Resizing)**。
  - [ ] 添加 **右键单元格复制** 功能。
  - [ ] 添加 **鼠标拖拽滚动** 表格功能。
- [ ] **增强控制栏**
  - [ ] 添加 **正则表达式过滤** 和 **源 IP 过滤器**。

---

## 📜 步骤 3：Logs 页面重构 (高优先级)

目标：解决长日志换行被截断的问题。

- [ ] **引入 `@tanstack/react-virtual`**
  - [ ] 替换现有的 `VirtualList`。
- [ ] **启用动态高度测量 (Dynamic Measurement)**
  - [ ] 配置 virtualizer 使用动态测量，允许日志根据内容自然换行。

---

## 📋 步骤 4：Rules 页面重构 (中优先级)

目标：统一技术栈，使用通用的表格组件。

- [ ] **引入 `@tanstack/react-table` 和 `@tanstack/react-virtual`**
  - [ ] 替换现有的 `VirtualTable`。
- [ ] **保持固定行高**
  - [ ] 继续使用固定行高（如 40px）以获得最佳性能。

---

## ⚡ 步骤 5：Proxies 页面重构 (可选 - 视节点数量而定)

目标：优化成百上千个节点卡片时的渲染性能。你可以选择以下两种方案之一：

- [ ] **方案 A：实现无限滚动 / 懒加载 (向 zashboard 看齐 - 推荐)**
  - [ ] 不使用真正的虚拟化，而是使用“按需渲染”。
  - [ ] 初始只渲染前 N 个节点，监听滚动事件，触底时增加渲染数量。


## 🧹 步骤 6：清理工作

- [ ] 当所有页面都重构完成后，删除项目中老旧的自定义组件：
  - [ ] `src/components/ui/VirtualList`
  - [ ] `src/components/ui/VirtualTable`
