# 功能配置需求 Spec

## Why

平台已经具备功能包注册、侧边栏导航与运行时启停能力，但「功能配置」一直缺少独立的需求文档，导致功能范围、权限边界与验收标准分散在代码和 `AGENTS.md` 中。本 Spec 用于明确功能配置的职责与行为，作为后续迭代与评审的依据。

## What Changes

- 明确「功能配置」页面的定位：管理已注册功能的启用状态，而不是在线新增或删除功能包。
- 规范功能列表展示、启停操作、持久化、导航与路由联动、权限控制。
- 要求每个功能提供实现步骤，并在功能页面底部展示，便于其他项目复用。
- 不改变现有功能包契约与注册方式。

## 现状

- 功能通过 `defineFeature` 声明，在 `apps/web/src/features.ts` 中注册到 `FeatureRegistry`。
- `/features` 为功能配置页，仅管理员可访问，可对功能执行启用 / 停用。
- 启停状态保存在 `localStorage` 的 `ffm:disabled-features` 键中，只记录停用列表。
- 停用后宿主不再生成对应路由，侧边栏也不再展示该功能；`setup` 仍在应用启动时执行一次。
- 侧边栏展示已启用功能，账号管理固定在菜单最底部。

## Requirements

### Requirement: 功能列表

功能配置页 SHALL 展示注册表中的全部功能，包含已停用功能，并按注册顺序排列。

每个功能 SHALL 展示名称、描述、版本、路由数量与当前启用状态。

#### Scenario: 查看功能列表

- **WHEN** 管理员进入 `/features`
- **THEN** 可以看到所有已注册功能及其启用状态
- **AND** 已停用功能仍然出现在列表中，便于重新启用

### Requirement: 功能启停

管理员 SHALL 能够启用或停用任意已注册功能，操作后列表状态立即更新。

启停结果 SHALL 持久化到 `localStorage`，刷新页面或重新登录后保持。

#### Scenario: 停用功能

- **WHEN** 管理员停用「活动流」
- **THEN** 左侧导航不再显示该功能
- **AND** 直接访问 `/activity` 返回 404 页面
- **AND** 刷新页面后仍保持停用状态

#### Scenario: 重新启用功能

- **WHEN** 管理员重新启用已停用的功能
- **THEN** 导航入口与路由立即恢复，无需重启前端

### Requirement: 与注册表解耦

功能配置 SHALL 只修改功能的启用状态，不修改功能元信息、路由或 `setup` 逻辑。

应用启动时 SHALL 对所有已注册功能执行一次 `setup`，与当前是否启用无关。

#### Scenario: 停用后事件仍初始化

- **WHEN** 一个功能被停用后重新启用
- **THEN** 其 `setup` 中注册的事件监听仍然有效，无需再次初始化

### Requirement: 权限控制

功能配置页 SHALL 仅管理员可访问。

查看者 SHALL 看不到功能配置导航入口；直接访问 `/features` 时 SHALL 被重定向到首页。

#### Scenario: 查看者访问功能配置

- **WHEN** viewer 登录后直接访问 `/features`
- **THEN** 页面重定向到 `/`
- **AND** 侧边栏不显示功能配置入口

### Requirement: 实现步骤展示

每个功能 SHALL 通过 `implementationSteps` 提供接入步骤。

宿主 SHALL 在对应功能页面下方展示「实现步骤」，内容来自该功能的声明。

#### Scenario: 查看功能实现步骤

- **WHEN** 用户进入任意已启用功能页面
- **THEN** 页面底部展示该功能的实现步骤列表
- **AND** 未提供步骤的功能不渲染该区块

### Requirement: 新增功能接入

新增功能 SHALL 遵循 `packages/FEATURE_INTEGRATION.md`：

- 新建 `@repo/feature-<id>` 功能包并导出 `defineFeature`。
- 在 `apps/web/src/features.ts` 注册。
- 在 `apps/web/package.json` 添加工作区依赖。
- 提供 `implementationSteps`。
- 运行 `pnpm check` 验证。

#### Scenario: 接入后自动生效

- **WHEN** 新功能完成注册并执行 `pnpm install`
- **THEN** 功能默认启用，导航与路由自动出现，无需修改功能配置页代码

## Non-Goals

- 不在线安装、卸载或热更新功能包。
- 不做远程功能市场、版本管理或回滚。
- 不做功能级细粒度权限（功能内部写操作由功能自行按角色限制）。
- 不将启停状态保存到后端，P0 继续使用 `localStorage`。
- 不提供功能排序、分组或自定义图标配置。
