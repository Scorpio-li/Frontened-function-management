# 前端功能管理平台账号与权限 Spec（P0）

## Why

当前 Monorepo 只有插件化功能展示与运行时启停，没有登录与账号体系，任何人打开页面都能操作。P0 需要补齐最小可用的账号登录、账号增删改查与角色隔离，为后续承载 HTML/CSS/Vue/React/ECharts/Node 等功能项目提供统一入口与权限基础。

## What Changes

- 新增 Node 后端应用 `apps/server`，提供认证与账号管理 API。
- 新增共享契约包 `@repo/contracts`，统一前后端账号 DTO、角色与错误码类型。
- 新增本地文件存储：账号写入 `apps/server/data/accounts.json`，密码使用 `node:crypto` 的 scrypt 哈希；管理员凭证仅从本地环境变量读取，数据与密钥均不进入 Git。
- 前端新增登录页、认证状态层、路由守卫、账号管理页；管理员可增删改，查看者只读。
- 现有「功能管理」页仅管理员可访问，查看者隐藏入口且无法通过地址访问。
- 本地开发通过 Vite `/api` 代理到后端，`pnpm dev` 同时启动前后端。
- **BREAKING**：宿主默认需要登录，未登录访问任意业务页面会跳转 `/login`。

## Impact

- Affected specs：账号与权限、本地开发集成、宿主导航与路由。
- Affected code：
  - 新增 `apps/server/**`、`packages/contracts/**`
  - 修改 `apps/web/src/**`（认证层、登录页、账号页、导航、路由守卫）
  - 修改 `apps/web/vite.config.ts`、根 `package.json`、`.gitignore`、`AGENTS.md`、`README.md`
  - 如需登记依赖版本，修改 `pnpm-workspace.yaml` 的 catalog
- 不改动 `feature-dashboard`、`feature-activity`、`feature-demo` 的功能契约。

## 设计约束

- 技术栈：Node.js 24 + TypeScript + Fastify 5 + `@fastify/cookie`；密码哈希与随机 ID 使用 Node 内置 `node:crypto`，除 Web 框架外不引入数据库或 ORM。
- 存储：JSON 文件（默认 `apps/server/data/accounts.json`），写入采用「临时文件 + rename」保证原子性；目录与文件被 `.gitignore` 忽略。
- 会话：服务端内存会话 + HttpOnly Cookie（`ffm_session`，`SameSite=Lax`，有效期 8 小时）；服务重启后需重新登录，P0 接受该行为。
- 角色：`admin`（内置唯一管理员）与 `viewer`；新建账号角色固定为 `viewer`，接口不接受客户端指定角色。
- 数据模型：

```ts
type Role = 'admin' | 'viewer';

interface Account {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

interface StoredAccount extends Account {
  passwordHash: string; // scrypt: <salt>:<hash>
}
```

- API 约定（统一前缀 `/api`）：

| 方法   | 路径            | 权限   | 说明                     |
| ------ | --------------- | ------ | ------------------------ |
| POST   | `/auth/login`   | 公开   | 登录并下发会话 Cookie    |
| POST   | `/auth/logout`  | 已登录 | 注销当前会话             |
| GET    | `/auth/me`      | 已登录 | 返回当前用户             |
| GET    | `/accounts`     | 已登录 | 账号列表（不含密码字段） |
| POST   | `/accounts`     | admin  | 创建 viewer 账号         |
| PATCH  | `/accounts/:id` | admin  | 修改用户名或密码         |
| DELETE | `/accounts/:id` | admin  | 删除 viewer 账号         |

- 错误语义：未登录 `401`；已登录但无权限 `403`；参数错误 `400`；用户名重复 `409`；资源不存在 `404`。

## ADDED Requirements

### Requirement: 本地管理员账号

系统 SHALL 提供唯一内置管理员 `admin`，其密码仅从本地环境变量 `FFM_ADMIN_PASSWORD` 读取，不得写入仓库、账号数据文件或前端产物；缺少该变量时服务 SHALL 启动失败并输出明确错误。内置管理员 SHALL 出现在账号列表中，但不可被编辑或删除。

#### Scenario: 使用本地凭证登录管理员

- **WHEN** 本地存在 `FFM_ADMIN_USERNAME=admin` 与 `FFM_ADMIN_PASSWORD` 且提交正确的用户名和密码
- **THEN** 登录成功，返回 `role: "admin"`，并下发会话 Cookie

#### Scenario: 仓库不包含管理员密码

- **WHEN** 检查 Git 跟踪文件
- **THEN** 不存在管理员明文密码、`.env.local` 或 `apps/server/data/` 下的数据文件

#### Scenario: 缺少管理员密码时启动

- **WHEN** 未配置 `FFM_ADMIN_PASSWORD` 启动服务
- **THEN** 服务拒绝启动并提示需要配置本地环境变量

### Requirement: 登录与会话

系统 SHALL 提供登录、注销与获取当前用户的接口，登录成功后通过 HttpOnly Cookie 维持会话；密码错误与用户不存在时 SHALL 返回相同的通用错误，避免泄露账号是否存在。

#### Scenario: 登录成功

- **WHEN** 已存在的账号提交正确的用户名与密码
- **THEN** 返回当前用户信息（不含密码字段），后续请求可访问受保护接口

#### Scenario: 登录失败

- **WHEN** 提交错误的密码或不存在的用户名
- **THEN** 返回 `401` 与统一错误信息，且不下发有效会话

#### Scenario: 未登录访问受保护接口

- **WHEN** 请求 `GET /api/accounts` 且没有有效会话
- **THEN** 返回 `401`

#### Scenario: 注销

- **WHEN** 已登录用户调用 `POST /api/auth/logout`
- **THEN** 服务端销毁会话并清除 Cookie，再次访问受保护接口返回 `401`

### Requirement: 账号列表

系统 SHALL 向所有已登录用户提供账号列表，包含内置管理员与所有 viewer 账号，但不得返回密码哈希或其他敏感字段。

#### Scenario: 管理员查看账号列表

- **WHEN** 管理员请求 `GET /api/accounts`
- **THEN** 返回内置 `admin` 与所有 viewer 账号，按创建时间倒序

#### Scenario: 查看者查看账号列表

- **WHEN** viewer 请求 `GET /api/accounts`
- **THEN** 返回与管理员相同的数据，但仅可读

### Requirement: 账号创建

管理员 SHALL 能够创建账号。用户名 SHALL 为 3–32 位小写字母、数字、下划线或连字符并在系统中唯一；密码 SHALL 至少 8 位；新账号角色 SHALL 固定为 `viewer`。

#### Scenario: 创建 viewer 账号

- **WHEN** 管理员提交合法且不重复的用户名与密码
- **THEN** 返回 `201`，列表中出现该账号且角色为 `viewer`

#### Scenario: 拒绝重复用户名

- **WHEN** 管理员提交已存在的用户名（忽略大小写）
- **THEN** 返回 `409`，不创建账号

#### Scenario: 拒绝非法角色

- **WHEN** 管理员在创建请求中指定 `role: "admin"`
- **THEN** 返回 `400`，不创建账号，系统中不会出现第二个管理员

#### Scenario: 查看者尝试创建

- **WHEN** viewer 调用 `POST /api/accounts`
- **THEN** 返回 `403`，账号列表不变

### Requirement: 账号编辑

管理员 SHALL 能够修改 viewer 账号的用户名或密码，两个字段均可选但不可同时为空；不得修改内置管理员，也不得通过编辑变更角色。

#### Scenario: 修改用户名

- **WHEN** 管理员提交未被占用的新用户名
- **THEN** 返回 `200`，列表展示新用户名，原密码仍可登录

#### Scenario: 重置密码

- **WHEN** 管理员提交合法的新密码
- **THEN** 返回 `200`，旧密码失效，新密码可登录

#### Scenario: 保护内置管理员

- **WHEN** 管理员尝试编辑 `admin`
- **THEN** 返回 `403`，内置管理员信息不变

### Requirement: 账号删除

管理员 SHALL 能够删除 viewer 账号。内置管理员不可删除；删除成功后该账号的现有会话 SHALL 失效。

#### Scenario: 删除 viewer 账号

- **WHEN** 管理员删除一个存在的 viewer 账号
- **THEN** 返回 `204`，列表不再包含该账号，该账号无法再登录

#### Scenario: 禁止删除管理员

- **WHEN** 管理员尝试删除 `admin`
- **THEN** 返回 `403`，账号仍存在

#### Scenario: 查看者尝试删除

- **WHEN** viewer 调用 `DELETE /api/accounts/:id`
- **THEN** 返回 `403`

### Requirement: 前端登录与路由保护

前端 SHALL 提供 `/login` 登录页，并在应用启动时通过 `GET /api/auth/me` 恢复会话。未登录用户访问任何业务路由 SHALL 被重定向到 `/login`；登录后返回原目标页。

#### Scenario: 未登录访问业务页

- **WHEN** 未登录用户直接访问 `/dashboard`
- **THEN** 跳转 `/login`，登录成功后回到 `/dashboard`

#### Scenario: 会话失效

- **WHEN** 已登录用户的操作收到 `401`
- **THEN** 清除前端登录态并跳转 `/login`

#### Scenario: 登录成功进入平台

- **WHEN** 用户提交正确凭证
- **THEN** 进入账号管理页或原目标页，侧边栏显示当前用户名与角色

### Requirement: 账号管理页面

前端 SHALL 提供账号管理页 `/accounts`，展示账号列表。管理员可见「新增账号」「编辑」「删除」操作；查看者仅能查看列表，不渲染任何写操作入口。删除前 SHALL 二次确认。

#### Scenario: 管理员增删改账号

- **WHEN** 管理员在账号管理页新增、编辑或删除 viewer 账号
- **THEN** 操作成功后列表即时刷新，并给出成功或失败提示

#### Scenario: 查看者只读

- **WHEN** viewer 登录并进入账号管理页
- **THEN** 可看到账号列表，但看不到新增、编辑、删除按钮

### Requirement: 角色化导航与功能管理

「功能管理」页 SHALL 仅管理员可访问；查看者 SHALL 看不到该导航项，直接访问时 SHALL 被重定向或展示无权限提示。现有功能模块页面 SHALL 对所有已登录用户可访问。

#### Scenario: 管理员启停功能

- **WHEN** 管理员进入「功能管理」
- **THEN** 可继续使用现有功能启停能力

#### Scenario: 查看者访问功能管理

- **WHEN** viewer 访问 `/`
- **THEN** 默认进入账号列表或只读首页，不显示功能启停入口

### Requirement: 本地数据持久化与敏感信息保护

账号数据 SHALL 持久化到本地文件，服务重启后仍可读取；密码 SHALL 以 scrypt 哈希存储；`.env.local`、数据目录与构建产物 SHALL 被 `.gitignore` 忽略；仓库仅提供不含真实密钥的 `.env.example`。

#### Scenario: 服务重启后数据仍在

- **WHEN** 创建账号后重启后端服务并使用正确密码登录
- **THEN** 该账号仍存在且可登录

#### Scenario: 密码不以明文落盘

- **WHEN** 查看 `accounts.json`
- **THEN** 不存在明文密码，仅有带盐的哈希值

### Requirement: 本地开发联动

根目录 `pnpm dev` SHALL 同时启动后端与前端；开发环境前端 SHALL 通过 Vite 代理将 `/api` 转发到后端（默认 `http://localhost:3001`），无需额外 CORS 配置。

#### Scenario: 一键启动

- **WHEN** 在根目录执行 `pnpm dev`
- **THEN** 前端运行在 5173、后端运行在 3001，登录与账号接口通过 `/api` 正常访问

## Non-Goals（P1 及以后）

- 不在本期实现 HTML/CSS/Vue/React/ECharts/Node 等异构功能项目的托管、构建与运行。
- 不做功能级细粒度权限、角色自定义、多管理员、注册、找回密码、SSO、审计日志。
- 不做生产部署、HTTPS、数据库或多实例会话共享。
- 不做功能模块本身的增删改（仅保留现有插件启停能力）。
