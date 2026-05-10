## Connections 页面列管理重构 (路线 B)

借鉴 Zashboard 的思路，将列的“顺序”和“可见性”合并为一个数组，彻底解决自动恢复初始状态的 Bug。


- [x] **1. 数据结构重构**
  - 在 `types` 和 `store` 中，移除独立的 `column_order` 配置。
  - 使 `visible_columns` 数组同时承担“可见性”和“显示顺序”的职责。

- [x] **2. 修复正规化逻辑**
  - 修改配置初始化和加载时的 `normalize` 逻辑。
  - 移除对默认可见列的“强制补全”行为，允许用户真正隐藏任意列。

- [x] **3. 适配 hooks 与数据流**
  - 更新 `useConnectionsStream`，使其直接依据 `visible_columns` 的内容和顺序来生成表格列定义。

- [x] **4. 适配 UI 控制逻辑**
  - 调整 `ConnectionCtrl`（列设置面板）和 `Connections` 页面的交互函数。
  - 将“勾选显示”和“上下移动”的操作全部转化为对 `visible_columns` 数组的增删和位置交换。
