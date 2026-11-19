# Tasks

- [x] Task 1: 新增共享契约包 `@repo/contracts`
  - [x] 创建 `packages/contracts`（package.json、tsconfig.json、src/index.ts）
  - [x] 定义 `Role`、`Account`、`CurrentUser`、登录/账号 DTO 与 API 错误码
  - [x] 在 `apps/server` 与 `apps/web` 中接入 `workspace:*` 依赖

- [x] Task 2: 搭建 `apps/server` 后端骨架与本地存储
  - [x] 创建 Fastify 应用入口、配置加载（端口、管理员账号、数据目录、会话时长）
  - [x] 实现 JSON 账号仓库：读取、原子写入、首次初始化空数据
  - [x] 实现 `GET /api/health` 与统一错误响应
  - [x] 添加 `dev`、`build`、`lint`、`typecheck`、`test` 脚本并接入 Turbo

- [x] Task 3: 实现认证与会话
  - [x] 使用 `node:crypto` scrypt 实现密码哈希与校验
  - [x] 启动时校验 `FFM_ADMIN_PASSWORD`，缺失则拒绝启动
  - [x] 实现 `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
  - [x] 实现 HttpOnly Cookie 会话与内存会话表、8 小时过期与清理
  - [x] 统一登录失败响应，避免用户名枚举

- [x] Task 4: 实现账号 CRUD API 与权限控制
  - [x] 实现 `GET /api/accounts`（合并内置 admin，屏蔽密码字段）
  - [x] 实现 `POST /api/accounts`（仅 admin、用户名规范化与唯一校验、密码强度、角色固定 viewer）
  - [x] 实现 `PATCH /api/accounts/:id`（仅 admin、禁止修改 admin、用户名/密码可选）
  - [x] 实现 `DELETE /api/accounts/:id`（仅 admin、禁止删除 admin、删除后使会话失效）
  - [x] 实现认证与角色校验依赖，保证 401/403 语义

- [x] Task 5: 服务端测试
  - [x] 使用 Vitest + 临时数据目录覆盖登录成功/失败、未登录 401
  - [x] 覆盖账号增删改查、重复用户名、非法角色、admin 保护、viewer 403
  - [x] 覆盖服务重启后的数据读取与哈希不落明文

- [x] Task 6: 前端认证层与登录页
  - [x] 新增 API 客户端与统一错误处理（携带 Cookie、处理 401）
  - [x] 新增 `AuthProvider` 与 `useAuth`，启动时调用 `/api/auth/me` 恢复会话
  - [x] 新增 `/login` 页面与表单校验、错误提示
  - [x] 新增路由守卫，未登录跳转登录并保留原目标地址
  - [x] 侧边栏展示当前用户名、角色与退出登录

- [x] Task 7: 账号管理页与角色化界面
  - [x] 新增 `/accounts` 页面：列表、加载态、空状态、错误提示
  - [x] 管理员可见新增/编辑/删除模态表单，删除需二次确认
  - [x] 查看者仅展示列表，不渲染任何写操作
  - [x] 「功能管理」页仅 admin 可访问，viewer 导航中隐藏
  - [x] 保持既有功能模块路由与事件流对已登录用户可用

- [x] Task 8: 本地开发集成与敏感信息隔离
  - [x] `apps/web/vite.config.ts` 增加 `/api` 代理到 3001
  - [x] 提供 `apps/server/.env.example`，并在本地创建被忽略的 `.env.local`
  - [x] 更新 `.gitignore`：`.env.local`、`apps/server/data/`
  - [x] 确认 `pnpm dev` 并行启动前后端

- [x] Task 9: 文档与全量验证
  - [x] 更新 `AGENTS.md`、`README.md`：新增账号体系、命令、环境变量与安全约定
  - [x] 运行 `pnpm check`（lint、typecheck、test、build）全部通过
  - [x] 浏览器验收：管理员登录、账号增删改、查看者只读、功能管理权限

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 2
- Task 5 依赖 Task 3、Task 4
- Task 6 依赖 Task 1、Task 3
- Task 7 依赖 Task 4、Task 6
- Task 8 依赖 Task 2、Task 6
- Task 9 依赖 Task 3 至 Task 8
