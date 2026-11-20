# Frontend Function Management

可拓展的前端功能管理 Monorepo 基座：以「宿主应用 + 独立功能包」的方式组织前端功能，支持新模块即插即用、运行时启停、模块间事件通信与共享基础设施。

当前已内置账号登录与权限的最小体系（P0）：账号登录、账号管理与角色隔离，以及首页与功能管理入口，为后续承载更多功能项目提供统一入口；暂不含多管理员、注册、找回密码与功能级细粒度权限。

## 技术栈

- pnpm 10 Workspace + Catalog、Turborepo 2
- React 19 + React Router 7、Vite 7
- Node.js 24 + Fastify 5（`@fastify/cookie`）后端，本地 JSON 文件存储 + scrypt 密码哈希
- TypeScript 5.9（严格模式）、ESLint 9、Prettier 3
- Vitest 3、Changesets、husky + lint-staged

## 快速开始

```bash
pnpm install
cp apps/server/.env.example apps/server/.env.local   # 然后把 FFM_ADMIN_PASSWORD 改成自己的本地密码
pnpm dev
```

`pnpm dev` 会同时启动前端（http://localhost:5173）与后端（http://localhost:3001），前端通过 Vite 代理访问 `/api`。

打开 http://localhost:5173 会跳转到登录页。管理员用户名默认 `admin`，密码由本地 `apps/server/.env.local` 中的 `FFM_ADMIN_PASSWORD` 决定——**请不要把真实密码写入仓库中的任何文件**。

## 目录结构

```text
apps/
  web/                     # 插件化宿主应用（首页、功能管理、账号管理）
  server/                  # 本地 Node 后端：认证与账号 API（data/ 为本地数据，不入库）
packages/
  core/                    # 功能注册表、事件总线、React 运行时
  contracts/               # 前后端共享的角色、账号 DTO、错误码与校验常量
  ui/                      # 共享组件与设计令牌
  utils/                   # 通用工具
  feature-dashboard/       # 示例功能：概览
  feature-activity/        # 示例功能：活动流
  feature-demo/            # 示例功能：示例页
  eslint-config/           # 共享 ESLint 配置
  FEATURE_INTEGRATION.md   # 功能接入文档（新增功能前必读）
```

## 常用命令

| 命令                              | 说明                            |
| --------------------------------- | ------------------------------- |
| `pnpm dev`                        | 同时启动前后端（5173 / 3001）   |
| `pnpm build`                      | 构建全部包与应用                |
| `pnpm lint`                       | ESLint 检查                     |
| `pnpm typecheck`                  | TypeScript 类型检查             |
| `pnpm test`                       | Vitest 单元测试                 |
| `pnpm check`                      | lint + typecheck + test + build |
| `pnpm format`                     | Prettier 格式化                 |
| `pnpm --filter @repo/server dev`  | 只启动后端（读取 `.env.local`） |
| `pnpm --filter @repo/server test` | 只运行后端测试                  |
| `pnpm --filter @repo/web dev`     | 只启动前端宿主                  |
| `pnpm changeset`                  | 创建变更记录                    |

## 账号与权限

- 角色分为 `admin`（管理员）与 `viewer`（查看者）。
- 管理员：可新增、编辑、删除账号，并可访问「功能管理」启停功能模块。
- 查看者：只能浏览账号列表与各功能页面，看不到也无法访问「功能管理」。
- 内置管理员由 `FFM_ADMIN_USERNAME`（默认 `admin`）指定，密码只从本地环境变量 `FFM_ADMIN_PASSWORD` 读取；管理员账号不落盘、不可编辑或删除。
- 登录状态由 HttpOnly Cookie 维持，会话保存在后端内存中，服务重启后需要重新登录（P0 预期行为）。
- 登录成功后进入首页 `/`；侧边栏「功能管理」分组下展示各已启用功能，账号管理固定在菜单最底部。

安全提示：`apps/server/.env.local` 与 `apps/server/data/` 均已被 `.gitignore` 忽略，仓库只提供占位用的 `apps/server/.env.example`；请不要提交真实密码或账号数据文件。

## 扩展功能

新增功能模块前必须先阅读 [packages/FEATURE_INTEGRATION.md](./packages/FEATURE_INTEGRATION.md)，其中说明了 React 原生接入方式，以及 HTML/CSS/JS、Vue、ECharts、Node 项目如何通过静态资源、iframe 或独立服务接入。

React 功能的标准流程：新建 `packages/feature-*` 包并导出 `defineFeature` 契约、在 `apps/web/src/features.ts` 注册、在 `apps/web/package.json` 添加工作区依赖。

更完整的架构契约、编码规范与 AI 协作约定见 [AGENTS.md](./AGENTS.md)。
