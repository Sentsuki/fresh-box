# Stack Configuration 优先级说明

## 配置应用顺序

当启动 sing-box 时，配置的应用顺序如下（优先级从低到高）：

1. **原始配置文件** - 用户选择的基础配置文件
2. **Config Override** - 通过 Settings 页面的 "Enable Config Override" 功能设置的覆盖配置
3. **Stack Configuration** - 通过 Settings 页面的 "Stack Configuration" 开关设置的 stack 选项

## Stack Configuration 功能

### 功能描述
- 允许用户快速切换配置文件中 `inbounds` 数组中的 `stack` 字段值
- 支持三个选项：`mixed`、`gvisor`、`system`
- 只有当配置文件中存在 `stack` 字段时才能使用此功能

### 优先级特性
- **高于 Config Override**：即使 Config Override 中设置了 `stack` 值，Stack Configuration 的设置也会覆盖它
- **独立存储**：Stack Configuration 的设置独立存储在 `stack_config.json` 文件中
- **动态应用**：在启动 sing-box 时动态应用，不会修改原始配置文件

### 使用场景
1. **快速切换网络栈**：无需手动编辑配置文件，通过界面快速切换
2. **覆盖批量配置**：当使用 Config Override 进行批量配置时，仍可单独控制 stack 选项
3. **临时调试**：在不同网络环境下快速测试不同的 stack 配置

## 配置文件结构

### 原始配置文件示例
```json
{
  "inbounds": [
    {
      "type": "tun",
      "stack": "mixed",
      "interface_name": "tun0"
    }
  ]
}
```

### Stack Configuration 存储文件 (stack_config.json)
```json
{
  "enabled": true,
  "stack_option": "gvisor"
}
```

## 实现细节

### 后端处理流程
1. 读取原始配置文件
2. 应用 Config Override（如果启用）
3. 应用 Stack Configuration（如果启用且配置文件包含 stack 字段）
4. 将最终配置写入 `temp_config.json`
5. 使用临时配置文件启动 sing-box

### 前端界面
- 在 Settings 页面的 Configuration 部分
- 位于 Config Override 开关之上，体现其更高的优先级
- 只有检测到配置文件中存在 stack 字段时才可用
- 提供三个选项的下拉菜单：Mixed、GVisor、System

## 注意事项

1. **配置文件要求**：只有当前选择的配置文件中包含 `stack` 字段时，Stack Configuration 功能才可用
2. **实时生效**：配置更改会在下次启动 sing-box 时生效
3. **不修改原文件**：所有配置覆盖都是临时的，不会修改原始配置文件
4. **优先级明确**：Stack Configuration > Config Override > 原始配置文件