# AGENTS.md

本文件面向在本仓库中协作的人与 AI Agent，说明项目结构、架构契约、开发命令与修改边界。**修改代码前请先阅读本文件。**

## 1. 项目定位

这是一个可拓展的前端功能管理 Monorepo，采用「宿主 + 功能包（插件）+ 共享基础设施」的结构：

- **宿主应用**只负责功能注册、导航生成、路由挂载、启停控制与依赖注入。
- **功能包**以 `@repo/feature-*` 独立开发、独立构建，不直接依赖宿主。
- 新增一个功能模块的标准动作是：新建功能包 → 在宿主注册，而不是在宿主里堆页面代码。
- 当前已内置账号登录与账号管理（P0）：由 `apps/server` 提供认证与账号 API，宿主默认需要登录才能访问业务页面。
- 已内置功能列表：管理员登记、编辑、删除功能条目（名称、类型、访问地址、描述），查看者只读并可在新窗口打开；数据落在 `apps/server/data/features.json`。

## 2. 技术栈

| 能力     | 选型                                      |
| -------- | ----------------------------------------- |
| 包管理   | pnpm 10 Workspace + Catalog 统一版本      |
| 任务编排 | Turborepo 2                               |
| UI       | React 19 + React Router 7                 |
| 构建     | Vite 7（应用）/ tsup 9（库）              |
| 后端     | Node.js 24 + Fastify 5（@fastify/cookie） |
| 存储     | 本地 JSON 文件 + scrypt 密码哈希          |
| 语言     | TypeScript 5.9，严格模式                  |
| 规范     | ESLint 9 扁平配置 + Prettier 3            |
| 测试     | Vitest 3                                  |
| 版本发布 | Changesets                                |
| Git 钩子 | husky 9 + lint-staged 16                  |

## 3. 目录结构

```text
.
├── apps/
│   ├── web/                      # 插件化宿主（Vite + React Router）
│   │   └── src/
│   │       ├── features.ts       # 功能包注册、事件总线、启停持久化、setup 执行
│   │       ├── App.tsx           # 根据注册表动态生成路由 + 认证/角色守卫
│   │       ├── auth/             # 认证上下文、登录态恢复、RequireAuth / RequireAdmin
│   │       ├── components/AppShell.tsx
│   │       └── pages/            # 宿主自身页面（登录、功能列表、账号管理、功能管理、404）
│   └── server/                   # 本地 Node 后端：认证、账号与功能列表 API（Fastify）
│       ├── src/                  # app / config / store / feature-store / session / password 与测试
│       └── data/                 # 账号与功能 JSON 存储目录（本地生成，已被 .gitignore 忽略）
├── packages/
│   ├── core/                     # 插件内核：FeatureRegistry / EventBus / React 运行时
│   ├── contracts/                # 前后端共享的账号、角色、DTO、错误码与校验常量
│   ├── ui/                       # 共享 UI 组件与设计令牌
│   ├── utils/                    # 通用工具函数
│   ├── feature-dashboard/        # 示例功能包：概览
│   ├── feature-activity/         # 示例功能包：活动流（演示事件总线）
│   └── eslint-config/            # 共享 ESLint 配置（不参与构建）
├── pnpm-workspace.yaml           # 工作区与依赖版本 Catalog
├── turbo.json                    # 任务管道与缓存策略
├── tsconfig.base.json            # TypeScript 基线配置
└── eslint.config.js              # 根 ESLint 入口
```

## 4. 常用命令

```bash
pnpm install                # 安装依赖（新增/删除包后必须执行）
pnpm dev                    # 同时启动前端（5173）与后端（3001）
pnpm build                  # 构建全部工作区包与宿主
pnpm lint                   # ESLint 全量检查
pnpm typecheck              # TypeScript 类型检查
pnpm test                   # Vitest 单元测试
pnpm check                  # 依次执行 lint / typecheck / test / build
pnpm format                 # Prettier 全量格式化
pnpm format:check           # 仅校验格式

pnpm --filter @repo/core test        # 只运行某个包的脚本
pnpm --filter @repo/web dev          # 只启动宿主
pnpm --filter @repo/server dev       # 只启动后端（读取 apps/server/.env.local）
pnpm --filter @repo/server test      # 只运行后端测试

pnpm changeset              # 创建变更记录
pnpm version-packages       # 消费 changeset 并更新版本 / CHANGELOG
pnpm release                # 构建并发布（发布前需配置 registry 与 access）
```

环境要求：Node.js >= 20.19，pnpm 10。若本机没有 pnpm，可使用 `corepack enable pnpm` 或 `npm i -g pnpm@10`。

首次运行前需复制 `apps/server/.env.example` 为 `apps/server/.env.local`，并把 `FFM_ADMIN_PASSWORD` 改成自己的本地管理员密码（默认管理员用户名为 `admin`）。`FFM_ADMIN_PASSWORD` 缺失时后端会拒绝启动，且该文件不得提交到仓库。

## 5. 架构契约

### 5.1 功能模块契约

功能包以命名导出方式提供一个由 `defineFeature` 声明、类型为 `Feature` 的对象：

```ts
import { defineFeature } from '@repo/core';

export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  description: '一段面向用户的描述',
  version: '0.1.0',
  setup({ eventBus }) {
    // 应用启动时执行一次，用于注册事件监听等
  },
  routes: [
    { path: '', label: '首页', element: DemoHomePage },
    { path: 'settings', label: '设置', element: DemoSettingsPage },
  ],
});
```

约定：

- 包名统一为 `@repo/feature-<id>`，`id` 全局唯一，注册表会拒绝重复或空 id。
- `routes[].path` 为相对路径，空字符串代表该功能首页；最终地址为 `/<featureId>/<path>`。
- `routes[].element` 是 React 组件，功能包自行组织页面、组件与状态。
- `setup` 在应用启动时对**所有**已注册功能执行一次，与当前是否启用无关；因此可安全地用它注册全局事件监听，停用功能只影响路由与导航。
- `setup` 中只做轻量初始化（如注册事件监听），不要执行重 CPU 任务或直接操作 DOM。
- 功能包不得导入 `apps/web`，也不得导入其他 `feature-*` 包；跨模块通信走事件总线。

### 5.2 路由与导航

- 宿主在 [App.tsx](apps/web/src/App.tsx) 中根据注册表动态生成 `<Route>`，停用的功能不会生成路由。
- 侧边栏导航同样来自注册表，多路由功能显示功能名作为分组标题，单路由功能直接显示功能名。
- 启停状态保存在 `localStorage` 的 `ffm:disabled-features` 键中；该键只存停用列表。

### 5.3 跨模块通信

使用 `@repo/core` 暴露的 `EventBus`，由宿主创建并通过 `FeatureProvider` 注入：

```ts
import { useEventBus } from '@repo/core';

const eventBus = useEventBus();
eventBus.emit('activity:record', { title: '标题', featureId: 'demo' });
const off = eventBus.on('activity:record', (payload) => {
  // 处理事件
});
```

内置事件契约位于 `AppEventMap`（`activity:record`、`activity:clear`）。需要新增全局事件时，使用 TypeScript 接口合并扩展，**不要**直接把业务字段塞进 `AppEventMap` 源码：

```ts
declare module '@repo/core' {
  interface AppEventMap {
    'demo:changed': { id: string };
  }
}
```

### 5.4 状态与订阅

`FeatureRegistry` 通过 `subscribe` + `getSnapshot` 暴露状态，宿主使用 `useFeatures()` 订阅；快照引用只在状态变化时替换，保证 `useSyncExternalStore` 的正确性。组件内不要直接修改注册表内部数据，统一调用 `setEnabled`。

### 5.5 依赖方向

```text
apps/web → @repo/feature-* → @repo/ui → @repo/utils
              ↘ @repo/core ↗
apps/web    → @repo/contracts
apps/server → @repo/contracts
```

- `@repo/core` 不得依赖 `@repo/ui`、`@repo/feature-*` 或任何应用。
- `@repo/utils` 保持零依赖、无 React。
- `@repo/contracts` 只放前后端共享的类型与校验常量，零运行时依赖；`apps/web` 与 `apps/server` 共同依赖它，避免契约漂移。
- `apps/server` 是独立的 Node 服务，不得导入 `@repo/ui`、`@repo/core`、`@repo/feature-*` 或宿主代码。
- 功能包之间的共享逻辑放到 `@repo/utils` 或 `@repo/ui`，不要互相引用。
- 新增第三方依赖时优先加到 `pnpm-workspace.yaml` 的 `catalog`，包内使用 `"catalog:"` 引用，避免版本漂移。

### 5.6 样式

- 设计令牌与组件样式都在 `packages/ui/src/styles.css`，类名以 `ffm-` 前缀命名，CSS 变量以 `--ffm-` 前缀命名。
- 宿主在入口统一引入 `@repo/ui/styles.css`，再引入应用级 `styles.css`，应用样式可覆盖组件样式。
- 功能包不要自带全局 CSS；确有局部样式需求时使用独立的类名前缀并说明。
- 目前未启用 CSS Modules / CSS-in-JS，保持简单。

## 6. 账号、认证与权限

当前为 P0 最小实现：单机部署、单个内置管理员、本地文件存储；不含多管理员、注册、找回密码、SSO、功能级细粒度权限，也不承担异构功能项目的托管与运行。

### 6.1 角色与内置管理员

- 角色只有两种：`admin`（管理员）与 `viewer`（查看者）。
- 内置唯一管理员：用户名由 `FFM_ADMIN_USERNAME` 指定（默认 `admin`），密码只从本地环境变量 `FFM_ADMIN_PASSWORD` 读取，缺失时服务拒绝启动。
- 内置管理员不写入 `accounts.json`，会出现在账号列表中，但不可编辑、不可删除。
- 其余账号角色固定为 `viewer`，接口不接受客户端指定角色；仅管理员可新增、修改、删除账号。

### 6.2 API

统一前缀 `/api`；请求与响应类型、角色与校验常量来自 `@repo/contracts`。

| 方法   | 路径                | 权限   | 说明                       |
| ------ | ------------------- | ------ | -------------------------- |
| GET    | `/api/health`       | 公开   | 健康检查                   |
| POST   | `/api/auth/login`   | 公开   | 登录并下发会话 Cookie      |
| POST   | `/api/auth/logout`  | 已登录 | 销毁当前会话并清除 Cookie  |
| GET    | `/api/auth/me`      | 已登录 | 返回当前用户               |
| GET    | `/api/accounts`     | 已登录 | 账号列表（不含密码与哈希） |
| POST   | `/api/accounts`     | admin  | 创建 viewer 账号           |
| PATCH  | `/api/accounts/:id` | admin  | 修改用户名或密码           |
| DELETE | `/api/accounts/:id` | admin  | 删除 viewer 账号           |
| GET    | `/api/features`     | 已登录 | 功能列表                   |
| POST   | `/api/features`     | admin  | 新增功能条目               |
| PATCH  | `/api/features/:id` | admin  | 修改功能条目               |
| DELETE | `/api/features/:id` | admin  | 删除功能条目               |

错误语义：未登录 `401`；已登录但无权限 `403`；参数错误 `400`；资源不存在 `404`；用户名重复 `409`；未预期异常 `500`。

### 6.3 会话机制

- 服务端内存会话 + HttpOnly Cookie `ffm_session`（`SameSite=Lax`，默认 8 小时，可用 `FFM_SESSION_TTL_HOURS` 调整）。
- P0 取舍：会话只存在内存中，**后端重启后全部失效，需要重新登录**，属预期行为。
- 删除账号会立即销毁该账号的全部会话；登录失败统一返回「用户名或密码错误」，避免账号枚举。

### 6.4 前端守卫与角色化导航

- `/login` 为登录页；应用启动时调用 `GET /api/auth/me` 恢复会话，任意接口返回 `401` 时清除前端登录态。
- 未登录访问任意业务路由会跳转 `/login`，登录成功后回跳原目标页。
- `/accounts` 为账号管理页：admin 可增删改（删除前二次确认），viewer 只读。
- `/functions` 为功能列表页：所有已登录用户可见，admin 可增删改（删除前二次确认），viewer 只读；点击「打开」在新窗口访问登记的地址。
- `/features` 功能管理页仅 admin 可访问；viewer 侧边栏不渲染该入口，直接访问会被重定向到 `/accounts`。
- 根路径 `/` 重定向到 `/accounts`；侧边栏底部显示用户名、角色与退出登录。

### 6.5 敏感数据约定

- 仓库只提供 `apps/server/.env.example` 占位值，真实密码写在本地 `apps/server/.env.local`。
- `.env.local` 与 `apps/server/data/`（含 `accounts.json`、`features.json`）已被 `.gitignore` 忽略，不得提交。
- 密码以 scrypt 哈希（`salt:hash`）落盘；代码、文档、接口响应中都不得出现明文密码。

## 7. 新增功能模块

1. 复制 `packages/feature-dashboard` 的目录结构与 `package.json`，包名改为 `@repo/feature-<id>`。
2. 在 `src/index.ts` 中用 `defineFeature` 导出功能对象；页面组件放在 `src/` 下。
3. 如需通信，只通过 `@repo/core` 的 `useEventBus` 或 `setup` 中的 `eventBus`。
4. 在 `apps/web/package.json` 的 `dependencies` 中添加 `"@repo/feature-<id>": "workspace:*"`。
5. 在 `apps/web/src/features.ts` 中导入并加入 `new FeatureRegistry([...])`。
6. 执行 `pnpm install` 后运行 `pnpm check` 验证。

## 8. 新增共享包

- 目录放在 `packages/<name>`，包名 `@repo/<name>`。
- `exports` 指向 `./src/index.ts`，便于宿主与功能包直接以源码参与 Vite 编译。
- `publishConfig` 指向 `dist`，`build` 使用 `tsup src/index.ts --format esm --dts --clean`。
- 需要被应用直接引入的 CSS，使用独立导出子路径（参考 `@repo/ui` 的 `./styles.css`）。
- 在根 `tsconfig.base.json` 约束下提供最小可用的 `tsconfig.json`（`extends` + `include`）。

## 9. 编码规范

- TypeScript 严格模式开启，包含 `noUncheckedIndexedAccess`、`noUnusedLocals`、`noUnusedParameters`；不要用 `any`，必要时用 `unknown` + 类型守卫。
- 类型导入必须使用 `import type`（ESLint 已强制）。
- React 使用函数组件与 Hooks；组件文件 PascalCase，Hook 以 `use` 开头。
- 领域代码与注释使用中文；变量、函数、类型使用英文命名。
- 不做与当前任务无关的重构；不引入 Redux / Zustand / 组件库等超出基座范围的大型依赖，确有需要先达成一致。
- 不手动编辑 `pnpm-lock.yaml`，不提交 `node_modules`、`dist`、`.turbo`。

## 10. 质量门禁

- 提交前建议执行 `pnpm check`（lint → typecheck → test → build 全部通过）。
- `husky` 的 pre-commit 只对暂存文件执行 `eslint --fix` 与 `prettier --write`，它不能替代全量类型检查与构建。
- 修改 `@repo/core` 的契约时，必须同步更新对应单元测试，并检查两个示例功能包与宿主。
- 涉及认证、账号或权限契约变更时，必须同步 `@repo/contracts` 与 `apps/server` 的测试（`apps/server/src/app.test.ts`），并检查宿主的登录守卫与角色化导航。
- 新增功能包后至少手动验证：导航出现、路由可访问、停用后消失、重新启用后恢复。

## 11. 版本与发布

- 使用 Changesets 管理包版本与 CHANGELOG；`@repo/web` 已在 `.changeset/config.json` 中忽略。
- 发布前确认 `access`、registry 与包名作用域；当前 `access` 为 `restricted`，面向公开 npm 发布时需调整。
- `release` 会先构建再发布，确保 `dist` 产物存在。

## 12. AI 协作约定

- 先读本文件与相关代码，再动手；不要凭猜测新增包或修改契约。
- 新功能默认放在 `packages/feature-*`，尽量不改宿主；需要改宿主时说明原因并保持最小改动。
- 契约变更（`Feature`、`AppEventMap`、registry API、`@repo/contracts` 中的账号/角色/DTO）必须同步文档、测试与调用方。
- 修改账号、认证或权限相关逻辑时，需同时更新 `apps/server` 的 Vitest 测试，并核对 `@repo/contracts` 与前端调用是否一致；不要在前端或后端各自重复定义 DTO。
- 不擅自升级工具链主版本、不替换包管理器、不修改 ESLint/Prettier 规则来规避报错。
- 完成后至少运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`，涉及构建配置时再运行 `pnpm build`。

## 13. 常见问题

| 现象                                | 处理                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm: command not found`           | `corepack enable pnpm` 或 `npm i -g pnpm@10`                                                      |
| 新增包后导入报错                    | 在根目录执行 `pnpm install` 重新建立 workspace 链接                                               |
| React 出现重复实例 / Hook 报错      | 确认所有包使用 catalog 中的同一 React 版本，Vite 已配置 `resolve.dedupe`                          |
| 端口被占用                          | 修改 `apps/web/vite.config.ts` 的 `server.port`，当前为 `strictPort`                              |
| 提交时钩子未执行                    | 执行 `pnpm prepare` 重新安装 husky 钩子                                                           |
| 新功能页面 404                      | 检查是否已在 `apps/web/src/features.ts` 注册、且功能处于启用状态                                  |
| 事件收不到                          | 确认功能已在 `setupAll` 之前注册，并在 `setup` 中完成订阅                                         |
| 登录接口 404 / 前端请求失败         | 确认后端已启动（默认 3001），`pnpm dev` 会同时拉起前后端，或手动 `pnpm --filter @repo/server dev` |
| 后端启动报缺少 `FFM_ADMIN_PASSWORD` | 复制 `apps/server/.env.example` 为 `apps/server/.env.local` 并设置管理员密码                      |
| 登录后刷新掉线                      | 会话保存在后端内存中，服务重启即失效，属 P0 预期行为；重新登录即可                                |
| viewer 看不到「功能管理」           | 角色限制：`/features` 仅 admin 可访问，viewer 会被重定向到 `/accounts`                            |
| 账号数据丢失 / 无法登录 viewer      | 确认 `apps/server/data/accounts.json` 存在且未被误删；管理员凭证只来自 `.env.local`               |
