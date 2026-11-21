# FFM 后端 Docker 部署与前端接入指南

> 配套文档：`docs/DEPLOY_GUIDE.md` 讲前端如何部署到 Vercel / Cloudflare。
> 本文档讲后端（`apps/server`，Fastify 5 有状态服务）如何容器化，以及两端如何打通 `/api`。

## 0. 结论与架构

**保持前端的 `/api` 同源反向代理，把后端跑在一台带持久卷的 Docker 容器里，通过 HTTPS 公网域名暴露。** 前端代码一行都不用改。

```
浏览器 ── https://<前端域名> ──> Vercel / Cloudflare Worker（静态站）
                                      │
                                      │ /api/* 同源反代（服务端到服务端，浏览器不可见）
                                      ▼
                              https://<后端 HTTPS 域名>
                                      │  Caddy / Cloudflare Tunnel / ngrok
                                      ▼
                              Docker 容器 ffm-server:3001
                                      │
                              named volume ffm-data:/app/data
                              （账号 / 效果数据 / 上传图片）
```

关键点：**浏览器只访问前端域名**。Cookie 由后端下发但被浏览器视为前端域名下的同站 Cookie，因此 `SameSite=Lax` 正常工作，混合内容（mixed content）问题也不存在——后端域名从不出现在浏览器地址栏或请求 URL 里。

## 1. 为什么必须走同源反代

三个已核实的事实共同决定了这一点：

| 事实                                                                                               | 位置                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------- |
| 前端写死 `const API_BASE = '/api'`，且 `credentials: 'same-origin'`；构建时不读取任何 `VITE_` 变量 | `apps/web/src/api/client.ts:12` |
| 后端会话 Cookie 是 `httpOnly: true, sameSite: 'lax', path: '/'`，没有 `domain`、没有 `secure`      | `apps/server/src/app.ts:84`     |
| 后端**没有注册 CORS**（依赖里没有 `@fastify/cors`）                                                | `apps/server/src/app.ts:113`    |

如果改成前端直连 `https://api.example.com`，需要同时做：改前端 `API_BASE` 和 `credentials: 'include'`、后端加 CORS 且 `origin` 必须精确匹配（不能用 `*`）+ `credentials: true`、把 Cookie 改成 `SameSite=None; Secure`、全链路 HTTPS，此外还要面对 Safari ITP / Chrome 对第三方 Cookie 的限制——登录态会时好时坏。详见第 11 节，本项目不采用。

同源反代还带来两个好处：Vercel / Cloudflare 会在服务端透传 Cookie 与 `Authorization`，且后端只需要一个 HTTPS 入口，不必对外暴露 CORS 配置。

## 2. 容器化的六个硬约束（均已实测）

| 约束                        | 原因                                                                                                                                                      | 本方案的处理                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `FFM_HOST` 必须是 `0.0.0.0` | `config.ts` 默认值是 `127.0.0.1`；容器里监听 loopback 会导致端口映射「通但拒绝连接」                                                                      | Dockerfile 的 `ENV` + compose 的 `environment` 双保险                                             |
| 数据必须持久化              | `data/` 下有 `accounts.json`、`features.json`、`css-effects.json` 和 `css-effect-assets/`（上传图片）                                                     | named volume `ffm-data:/app/data`                                                                 |
| 会话在内存里                | `SessionStore` 是 `Map`，重启即全部失效                                                                                                                   | `restart: unless-stopped`；禁止 `--scale server>1`（见第 8 节）                                   |
| 密钥不能进镜像              | `apps/server/.env.local` 含真实密码，`pnpm deploy` 会把整个 `apps/server` 目录复制出来                                                                    | `.dockerignore` 排除 `**/.env*`、`apps/server/data`；密钥只经 `env_file` 注入                     |
| pnpm 必须 `10.34.9`         | pnpm 9 会忽略 `lockfileVersion: '9.0'` 并以 `ERR_PNPM_NO_LOCKFILE` 报错（Cloudflare 构建已踩过）                                                          | Dockerfile 里 `npm i -g pnpm@10.34.9`                                                             |
| workspace 依赖导出要修正    | `@repo/contracts` 的 `exports.default` 指向 `src/index.ts`，但 `pnpm deploy` 受 `files: ["dist"]` 限制只带上了 `dist/`，直接运行会 `ERR_MODULE_NOT_FOUND` | Dockerfile 里把 `exports` 改指向编译后的 `dist/index.js`，产物不再依赖 Node 22.18+ 的 TS 类型剥离 |

另外 `pnpm deploy` 用了 `--legacy`：pnpm 10 默认要求 workspace 设置 `inject-workspace-packages=true`，本仓库未开启，官方允许用 `--legacy` 走旧实现，这样就不必改仓库配置。`--prod` 保证镜像里不带 `tsup` / `vitest` / `typescript` 等开发依赖。

## 3. 快速开始（本地先跑通）

```bash
cd /Users/lizhiliang/Desktop/Gitee/Frontened-function-management

# 1) 创建密钥文件（已被 .gitignore 忽略，绝不要提交）
cp apps/server/.env.docker.example apps/server/.env.docker
#    编辑 FFM_ADMIN_PASSWORD，换成自己的长随机密码

# 2) 校验 compose 配置（.env.docker 缺失时会显式报错，这是有意的）
docker compose config --quiet

# 3) 构建并启动
docker compose up -d --build server
docker compose ps                  # STATUS 应变为 healthy

# 4) 直连后端验证
curl -i http://127.0.0.1:3001/api/health
```

预期 `{"status":"ok"}`。再验证登录与 Cookie：

```bash
curl -i -c /tmp/ffm.cookie -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<你的密码>"}' \
  http://127.0.0.1:3001/api/auth/login
# 200 + Set-Cookie: ffm_session=...; Path=/; HttpOnly; SameSite=Lax

curl -b /tmp/ffm.cookie http://127.0.0.1:3001/api/auth/me
# 200，返回 admin 用户
```

数据卷验证（重启后账号还在，但登录态会失效，属预期）：

```bash
docker compose exec server ls -la /app/data
docker compose restart server
curl -i http://127.0.0.1:3001/api/health
```

## 4. 生产 HTTPS 出口（三选一）

后端必须有一个 **HTTPS 公网域名**。三选一即可，不要同时启用两个 profile。

### 4.1 Caddy 自动证书（自有 VPS + 域名）

前提：域名 A 记录指向该机，安全组放行 80 / 443（Let's Encrypt 校验需要 80）。

```bash
# 在仓库根创建 .env（compose 自动读取，该文件已被 .gitignore 忽略）
# 下面的 api.example.com 是占位示例，必须换成自己的域名，且 A 记录指向本机
echo 'FFM_API_DOMAIN=api.<你的域名>' >> .env

docker compose --profile tls up -d --build
docker compose --profile tls logs -f caddy
curl -i https://api.<你的域名>/api/health
```

`Caddyfile` 只把 `/api/*` 转发给 `server:3001`，其它路径一律 404，避免暴露无关内容。证书由 Caddy 自动申请并续期，存放在 `caddy-data` 卷。

### 4.2 无公网 IP 的 HTTPS 出口：Cloudflare Tunnel 与免费替代方案

**前提（最容易漏）**：必须有一个自己控制的域名，并且**已添加到该 Cloudflare 账号**（Zone 状态 Active、域名的 NS 已指向 Cloudflare）。本文所有 `api.example.com` 都是占位示例 —— `example.com` 是 IANA 保留域名，`api.example.com` 永远不会解析到任何人的隧道，直接照抄去 `curl` 必然报 `Could not resolve host`。下文一律用 `api.<你的域名>` 表示，操作时要整体替换。

#### 第 1 步：创建隧道并让 connector 上线

1. Cloudflare Dashboard → **Networking → Tunnels**（旧版界面：Zero Trust → Networks → Tunnels）→ **Create a tunnel** → 选 **cloudflared** → 填名字 → Save。
2. 复制安装命令里的 **token**（一长串），写入仓库根 `.env`：`CF_TUNNEL_TOKEN=<token>`（该文件已被 `.gitignore` 忽略）。
3. `docker compose --profile tunnel up -d --build`，等 Tunnels 列表里状态变成 **HEALTHY** 再做下一步。

#### 第 2 步：填 Service（2026 新版界面里位置变了）

新版 Dashboard 在创建向导中**不会**直接出现 Service 输入框：保存隧道、connector 上线后，需要进隧道详情自己加路由。

> 隧道详情 → **Routes** 标签 → **Add route** → 选 **Published application**
>
> - Subdomain：`api`
> - Domain：下拉选你的域名（**若下拉框是空的**，说明域名没加到这个 Cloudflare 账号，回到上面的前提）
> - Path：**留空**（后端本身只注册了 `/api/*`；官方明确说明填 path 不会剥离或重写路径，留空最不易出错）
> - **Service URL**：`http://server:3001`
>
> 点 **Add route** 保存。

旧版界面对照：选中隧道 → **Configure** → **Public Hostname** 标签 → **Add a public hostname** → **Service** 里 **Type = HTTP / URL = `server:3001`** → Save。

**「没有地方可以填 Service」的三个高频原因**：

| 现象                                  | 原因                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 只看到安装命令 / 隧道概览页           | 还没进 **Routes** 标签，或创建向导没点 Continue 到 **Publish an application** 那一步                                 |
| 表单里只有 Network / CIDR 输入框      | 选成了 **Connect a network / Tunnel CIDR**（私网路由），那个页面本来就没有 Service；必须选 **Published application** |
| 字段叫 `Service URL` 而不是 `Service` | 新版界面改了名字，就是同一个东西                                                                                     |

**Service URL 填什么，取决于 cloudflared 跑在哪里**（填错的典型表现：隧道 HEALTHY 但访问返回 502）：

| cloudflared 启动方式                                                          | Service URL             | 原因                                                                          |
| ----------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| 本仓库 `docker compose --profile tunnel`（推荐，与 server 同一 compose 网络） | `http://server:3001`    | Docker 内置 DNS 能解析服务名 `server`                                         |
| Dashboard 复制的 `docker run ... --token` 在宿主机单独跑                      | `http://127.0.0.1:3001` | 宿主机没有 `server` 这个 DNS 名，而 compose 已把 3001 映射到 `127.0.0.1:3001` |

不要填 `localhost` —— 在容器里它指的是 cloudflared 自己。

#### 第 3 步：手动确认 DNS 记录（这一步解决 `Could not resolve host`）

新版界面 / API 改版后，**添加 Published application route 不再保证自动创建 CNAME**（Cloudflare 社区 2025-10 已确认该行为变化，官方文档现在也把手动 Add record 列为标准步骤）。保存 route 后，到 **域名 → DNS → Records** 看一眼：

- 已有 `api` 的 CNAME → 跳过。
- 没有 → **Add record**：Type `CNAME`，Name `api`，Target `<隧道 UUID>.cfargotunnel.com`，代理状态开启（橙色云）。UUID 在 Tunnels 列表点开隧道即可看到；本地管理的隧道也可执行 `cloudflared tunnel route dns <隧道名> api.<你的域名>` 让 CLI 代建。

`curl: (6) Could not resolve host` 只说明 **DNS 里没有这条记录**，与容器、后端、token 都无关。验证：

```bash
dig +short api.<你的域名>
# 应看到指向 <UUID>.cfargotunnel.com 的 CNAME 链
```

#### 第 4 步：验证并回填到前端

```bash
curl -i https://api.<你的域名>/api/health    # 期望 200 {"status":"ok"}
```

| 现象   | 原因与处理                                                                              |
| ------ | --------------------------------------------------------------------------------------- |
| `1016` | DNS 有了但隧道 down → `docker compose --profile tunnel ps`，看 cloudflared 日志与 token |
| `1033` | CNAME 目标写错了（必须是 `<UUID>.cfargotunnel.com`）                                    |
| `502`  | Service URL 填错，按第 2 步的表选择正确地址                                             |
| 超时   | 出方向 7844 端口被防火墙拦截，检查 `cloudflared` 能否连上 Cloudflare                    |

拿到真实域名后，替换 `vercel.json` 里的 `REPLACE_WITH_YOUR_API_ORIGIN`，并把 `wrangler.toml` 的 `[vars] API_ORIGIN` 填成同一个域名（推荐写法，只需一处，见 6.2），详见 6.1 / 6.2。

**优点**：不需要公网 IP、不开放任何入站端口、证书由 Cloudflare 管理。**API 域名不要和前端 Worker 用同一个 hostname**，否则 `worker/index.js` 的自循环保护会返回 502。

#### 出口方案对比：免费 / 付费（2026-11 核实）

**先厘清一个前提**：Cloudflare **不提供免费域名注册**。Registrar 是按批发价付费的（`.com` 约 $11/年，零加价）；它免费给的 `<项目>.pages.dev`、`<项目>.<子域>.workers.dev`、Quick Tunnel 的 `*.trycloudflare.com`、隧道内部的 `<UUID>.cfargotunnel.com`，都**不是你账号里的 zone**，因此既填不进 Tunnel 的 Domain 下拉框，也不能当作稳定的 `API_ORIGIN`。

| 方案                                                | 成本                                           | 域名来源                              | 重启后域名不变       | 主要限制                                                                                         | 适合                     |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| 买域名 + 本节 Cloudflare Tunnel                     | 域名年费（.com 约 ¥80/年，.xyz/.top 首年几元） | 自己注册，NS 接入 Cloudflare          | 是                   | 必须把 NS 改成 Cloudflare；Tunnel 本身免费、无流量上限                                           | 生产、长期               |
| 买域名 + Caddy（4.1）                               | 同上                                           | 自己注册，A 记录指向 VPS              | 是                   | 需公网 IP、放行 80/443                                                                           | 有 VPS                   |
| **ngrok 免费版固定 dev domain（本项目采用，见下）** | 0                                              | 自动分配 `*.ngrok-free.app`，绑定账号 | **是**               | 1 GB/月出站、20,000 请求/月、3 个在线 endpoint；HTML 浏览器流量有警告页                          | 个人、低流量、不想买域名 |
| Cloudflare Quick Tunnel                             | 0                                              | 随机 `*.trycloudflare.com`            | **否，每次重启都变** | 无账号、约 200 并发、不支持 SSE、无 SLA；域名一变就要改变量并重部署                              | 临时演示                 |
| 免费二级域名（eu.org / us.kg）+ Tunnel              | 0                                              | 第三方免费二级域名                    | 是，但可能被回收     | 人工审核 1–14 天；后缀必须在 PSL 且服务商允许改 NS，CF 免费版只收根域，zone 能否 Active 是道闸门 | 实验                     |
| DuckDNS / No-IP 等动态 DNS                          | 0                                              | 动态子域                              | 是                   | 只给 A 记录、不能改 NS → 进不了 Cloudflare zone                                                  | 用不了 Tunnel            |

结论：**不买域名又想要稳定地址，ngrok 免费版的固定 dev domain 是唯一兼顾「免费 + 固定 + HTTPS」的选项**；代价是月度额度，以及一个对我们的架构基本无影响的浏览器警告页（见下）。

#### 本项目采用：ngrok 免费版固定 dev domain

ngrok 免费计划给账号**自动分配一个 dev domain**（形如 `your-assigned-name.ngrok-free.app`），它绑定账号、**重启 agent 不变**，`ngrok http` 会自动使用它 —— 不需要 `--domain` / `--url`（那些是付费版自定义域名才用）。免费 endpoint 没有超时，可以长期在线。

1. 注册 https://dashboard.ngrok.com/signup → 复制 **authtoken**；在 Dashboard → Domains 可看到分配给你的 dev domain，也可在第 3 步启动后从终端输出或 `http://127.0.0.1:4040` 检查界面读取。
2. 仓库根 `.env` 追加 `NGROK_AUTHTOKEN=<token>`（该文件已被 `.gitignore` 忽略，绝不提交）。
3. 启动（ngrok 容器与 server 在同一 compose 网络，直接指向 `server:3001`）：

   ```bash
   docker compose --profile ngrok up -d --build
   ```

   或不在 Docker 里跑：`ngrok config add-authtoken <token> && ngrok http 3001`。

4. 验证（把 `<你的dev域名>` 换成实际值）：

   ```bash
   curl -i https://<你的dev域名>.ngrok-free.app/api/health    # 期望 200 {"status":"ok"}
   ```

   免费版对 **HTML 浏览器流量**显示警告页（`ERR_NGROK_6024`），官方明确说明「does not impact users serving APIs or accessing ngrok endpoints programmatically」。本项目里浏览器只访问前端域名、后端域名仅被 Worker / Vercel 在服务端 fetch，**用户看不到也不受影响**；`worker/index.js` 还额外注入了官方支持的 `ngrok-skip-browser-warning` 头做双保险。若 curl 仍拿到 HTML，加 `-H 'ngrok-skip-browser-warning: 1'` 重试。

5. 回填前端：`vercel.json` 的 `REPLACE_WITH_YOUR_API_ORIGIN` 与 `wrangler.toml` 的 `[vars] API_ORIGIN` 都填 `https://<你的dev域名>.ngrok-free.app`（域名以 Dashboard → Domains 显示为准，免费后缀可能是 `.ngrok-free.app` 或 `.ngrok-free.dev`），commit + push 到 GitHub 后 Retry deployment。

6. 免费额度与风险（Dashboard → Usage 可查）：**1 GB/月出站流量、20,000 HTTP 请求/月、4,000 请求/分、最多 3 个在线 endpoint、1 个 dev domain**；用尽会返回 `ERR_NGROK_725`（带宽）/ `ERR_NGROK_727`（请求数）。域名由 ngrok 分配、不可自定义，且暴露的是整个 3001（Fastify 本身只注册 `/api/*`），请按第 9 节做来源校验与登录限流。机器休眠或容器重启会短暂断连，`restart: unless-stopped` 会自动重连且域名不变。

Vercel 的 rewrites 不会改写请求头，若偶发在 Vercel 侧拿到 HTML 警告页，把生产流量放到已注入跳过头的 Cloudflare Worker，或升级 ngrok Hobbyist（$10/月，5 GB/月并移除警告页）。

### 4.3 已有 Nginx / 云负载均衡

反代到 `127.0.0.1:3001`，只转发 `/api/*`，保留 `Host` 与 `X-Forwarded-Proto`，TLS 在 LB 终结。

**不要**把 3001 直接暴露到公网：`docker-compose.yml` 只绑定 `127.0.0.1:3001:3001` 是刻意的，公网流量一律经 Caddy / Tunnel / ngrok 进入。

## 5. 环境变量清单

| 变量                                                       | 必填 | 来源          | 说明                                                                             |
| ---------------------------------------------------------- | ---- | ------------- | -------------------------------------------------------------------------------- |
| `FFM_ADMIN_PASSWORD`                                       | 是   | `.env.docker` | 为空时 `loadConfig()` 直接拒绝启动。绝不进 CI、不进 Vercel/CF 变量、不进前端构建 |
| `FFM_ADMIN_USERNAME`                                       | 否   | `.env.docker` | 默认 `admin`                                                                     |
| `FFM_SESSION_TTL_HOURS`                                    | 否   | `.env.docker` | 默认 8 小时                                                                      |
| `FFM_HOST`                                                 | 是   | compose 固定  | 必须是 `0.0.0.0`                                                                 |
| `FFM_PORT`                                                 | 是   | compose 固定  | `3001`                                                                           |
| `FFM_DATA_DIR`                                             | 是   | compose 固定  | `/app/data`，对应 `ffm-data` 卷                                                  |
| `SMTP_HOST` / `PORT` / `SECURE` / `USER` / `PASS` / `FROM` | 否   | `.env.docker` | 全部留空时 `/api/mail/*` 返回 503，其余功能不受影响                              |
| `NGROK_AUTHTOKEN`                                          | 否   | 根 `.env`     | 仅 `--profile ngrok` 需要；ngrok 免费账号的 authtoken，绝不入库                  |
| `CF_TUNNEL_TOKEN`                                          | 否   | 根 `.env`     | 仅 `--profile tunnel` 需要；Cloudflare Tunnel 的 connector token                 |

compose 的 `environment` 优先级高于 `env_file`，所以即使 `.env.docker` 里误填了 `FFM_HOST`，也会被正确的 `0.0.0.0` 覆盖。

## 6. 前端接入

### 6.1 Vercel

`vercel.json` 已经加好两条 rewrite 和防缓存头，你只需要替换一个字符串：

```json
{ "source": "/api/:path*", "destination": "https://REPLACE_WITH_YOUR_API_ORIGIN/api/:path*" }
```

把 `REPLACE_WITH_YOUR_API_ORIGIN` 换成第 4 节拿到的域名（纯 origin，不带路径、不带末尾斜杠），例如 `https://api.<你的域名>`；采用 4.2 的 ngrok 免费方案则填 `https://<你的dev域名>.ngrok-free.app`。文档里的 `api.example.com` 一律是占位示例，不是可用地址。**`/api` 规则必须在 `/(.*)` catch-all 之前**（Vercel 取第一条匹配）。

`headers` 里 `/api/:path*` 的 `CDN-Cache-Control: no-store` 不能删：Vercel 对 2026-04-06 之后创建的项目默认会按上游 `Cache-Control` 缓存外部 origin 的响应，API 响应一旦被 CDN 缓存就可能串号。

Vercel 会透传访客的 Cookie / `Authorization`，并附加 `x-forwarded-*` 头；后端目前不依赖这些头，无需配置 `trustProxy`。

改完 commit + push 到 GitHub 触发部署，然后：

```bash
curl -i https://<vercel域名>/api/health
curl -i -c /tmp/v.txt -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<你的密码>"}' \
  https://<vercel域名>/api/auth/login
```

**Set-Cookie 的域应是前端域名**，这是同源反代生效的直接证据。

可选加固：用 Vercel `routes` 的 request header transform 注入 `x-origin-secret`，在 Caddy 层校验，拒绝绕过 Vercel 直连后端的请求（官方 `Restricting your origin to Vercel traffic` 做法）。

### 6.2 Cloudflare Workers Builds

这一侧和 Vercel 不同：**Workers Static Assets 的 `_redirects` 不支持代理外部域名**（官方原文 "Proxying will only support relative URLs on your site. You cannot proxy external domains."），只有传统 Pages 才能用 `/api/* https://... 200`。所以本项目改由 Worker 脚本转发，已落地：

- `worker/index.js`：对 `/api/*` 用 `fetch` 转发到 `env.API_ORIGIN`，其余请求交给 `env.ASSETS.fetch(request)`；原样返回上游响应以保证 `Set-Cookie` 透传。
- `wrangler.toml`：新增 `main = "worker/index.js"`、`[assets] binding = "ASSETS"`、`run_worker_first = ["/api/*"]`。加了 `main` 后 Worker 会随静态资源一起部署；`/api/*` 先跑 Worker，其余仍走 asset-first + `not_found_handling` 的 SPA 回退。
- `apps/web/public/_redirects`：已纠正上一版注释（原先那条「接入后端时取消注释」是错的，照做会静默失效）。**这个文件保持只有注释即可。**

**`API_ORIGIN` 在哪里设置（这是最容易踩坑的一点）**

它**不是构建环境变量**，不在 4.3 的 `PNPM_VERSION` 那张表里，也不在「Settings → Environment variables」页面。它是 **Worker 运行时绑定变量**，读取方是 `worker/index.js` 的 `env.API_ORIGIN`。有两条路，**优先用 A**：

**A. 写进 `wrangler.toml` 的 `[vars]`（推荐，本项目已按此配好）**

`wrangler.toml` 末尾已生效，值与 `vercel.json` 的 rewrite 目标一致：

```toml
[vars]
API_ORIGIN = "https://overexert-decree-ground.ngrok-free.dev"
```

若以后换了 ngrok dev domain，改这里和 `vercel.json` 两处即可。

为什么推荐：本项目 Deploy command 是 `npx wrangler deploy -c wrangler.toml`，Wrangler 把配置文件当作 source of truth，官方明确说明「在 Dashboard 里修改的环境变量会在下一次 deploy 时被覆盖」。也就是说**只在 Dashboard 里加变量，每次 push 后都会被清掉**，`/api` 又变回 503。`API_ORIGIN` 只是公开域名、不是密钥，放进 `[vars]` 符合官方「非敏感配置用 vars」的建议，还能随 git 版本化、可回滚。生产与分支部署都读同一份 `wrangler.toml`，**只需写一处**。

**B. 在 Dashboard 设置（仅当你不想把域名写进仓库）**

路径是 **Workers & Pages → 选中 Worker → Settings → Variables and secrets → Add**（不是 "Environment variables"）。Settings 里 `Variables and secrets`、`Bindings` 等区块带有 **Production / Previews Base** 切换，两个位置都要设：Workers Previews **不继承**生产设置。采用 B 必须额外做两件事，否则变量会失效：

1. 在 `wrangler.toml` 顶层加 `keep_vars = true`（或给 Deploy command 加 `--keep-vars`），阻止 `wrangler deploy` 覆盖 Dashboard 变量；
2. 按官方要求，把 Dashboard 生成的 `previews` 配置片段复制回 `wrangler.toml`，保持后续部署同步。

注意：`[vars]` 里放的是明文，只能放公开域名；密码 / token 一律用 `wrangler secret put` 或 Dashboard 的 **Secret** 类型，不要写进仓库。本项目后端密钥都在 `.env.docker`，与这里无关。

**后续步骤**

1. Deploy command 保持 `npx wrangler deploy -c wrangler.toml`，非生产分支保持 `npx wrangler versions upload -c wrangler.toml`。
2. `wrangler.toml` 有改动，**必须 commit + push 到 GitHub** 才会被 Cloudflare 克隆到；然后 Retry deployment。改 Dashboard 变量同样需要重新触发部署。
3. 验证：`curl -i https://<项目>.workers.dev/api/health`（或自定义域名），期望 `200 {"status":"ok"}`。

排错提示：`/api/*` 返回 `503 {"code":"INTERNAL_ERROR","message":"API_ORIGIN 未配置..."}` 说明 `[vars]` 被删 / 改动未推送 / 或改用了 Dashboard 变量却没加 `keep_vars`；返回 `502 ... API_ORIGIN 不能指向本站点自身` 说明把前端域名填进去了。

### 6.3 两个平台都接时

共用一个后端实例即可。注意它是单实例 + 内存会话：两边用户共享同一份数据，但任何一次容器重启会让**两边**的登录态同时失效。建议只在一个平台放生产流量，另一个做预览。

## 7. 端到端验证清单

1. `docker compose ps` 中 `server` 为 `healthy`。
2. 后端直连 `/api/health` 返回 200。
3. 后端登录返回 200 且带 `Set-Cookie: ffm_session=...`。
4. 前端域名 `/api/health` 返回 200（不是 HTML）。
5. 前端域名登录返回 200，`Set-Cookie` 的域是前端域名（同源反代生效）。
6. 带 Cookie 请求 `/api/auth/me` 返回 200。
7. 浏览器打开前端 → 能登录 → 账号管理 / CSS 效果可用 → 上传一张图片 → 刷新后图片仍在（卷生效）。
8. `SMOKE_API=1 bash scripts/pipeline/smoke.sh https://<前端域名>` 通过（脚本已内置可选的 `/api/health` 探针）。

## 8. 运维

**备份**（卷名以 `docker volume ls` 实际输出为准，compose `name: ffm` 时通常是 `ffm_ffm-data`）：

```bash
docker volume ls | grep ffm
docker run --rm -v ffm_ffm-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/ffm-data-$(date +%F).tgz -C /data .
```

**恢复**：`docker compose down` → 用同样的 alpine 命令把归档解回卷 → `docker compose up -d`。

**更新镜像**：`git pull && docker compose up -d --build server`。数据卷保留，但内存会话清空，所有用户需重新登录。改了 `FFM_ADMIN_PASSWORD` 也要重启容器才生效。

**日志**：`docker compose logs -f server`（Fastify JSON 日志）。

**水平扩展**：不要执行 `docker compose up --scale server=2`。内存 `SessionStore` 与本地 JSON 文件都不支持多实例。要扩展需先外置会话（Redis）+ 共享存储/对象存储 + 文件写入加锁，属于另一轮改造。

## 9. 上线前安全加固

- **限制来源**：后端只接受来自 Vercel / Cloudflare 的流量——Caddy 层校验 `x-origin-secret`（Vercel `routes` transform 或 Worker 里 `headers.set` 注入），或防火墙按来源 IP 白名单。
- **登录限流**：Caddy 的 `rate_limit` 或 Cloudflare WAF 规则保护 `/api/auth/login`；管理员密码用长随机串。
- **HTTPS**：Vercel 的 rewrite 目标与 `API_ORIGIN` 都填 `https://`，不要用 http 裸奔。
- **密钥边界**：`FFM_ADMIN_PASSWORD`、`SMTP_PASS` 只存在于 `apps/server/.env.docker`；不进 GitHub、不进 Vercel/CF 环境变量、不注入前端构建（前端不读取任何 `VITE_` 变量）。
- **Cookie Secure**：当前 Cookie 未设 `Secure`。若前端与后端都只在 HTTPS 下访问，可在后端按 `X-Forwarded-Proto` 判断并加上 `secure: true`（需启用 `trustProxy`），作为后续加固项。
- 定期更新基础镜像并 `docker image prune`。

## 10. 故障排查

| 现象                                                               | 原因                                                                                   | 处理                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 容器起不来，日志「缺少 FFM_ADMIN_PASSWORD」                        | `.env.docker` 没建或密码为空                                                           | 按第 3 节创建并填密码                                                               |
| 端口映射通但 connection refused                                    | `FFM_HOST=127.0.0.1`                                                                   | compose 已固定 `0.0.0.0`；若自行 `docker run`，务必加 `-e FFM_HOST=0.0.0.0`         |
| 构建报 `Ignoring not compatible lockfile` / `ERR_PNPM_NO_LOCKFILE` | pnpm 版本不对                                                                          | Dockerfile 已固定 10.34.9；确认根 `packageManager` 未被改动                         |
| 启动报 `ERR_MODULE_NOT_FOUND .../@repo/contracts/src/index.ts`     | deploy 产物导出修正丢失                                                                | 恢复 Dockerfile 里 patch `exports` 的那段 `RUN`                                     |
| `/api/health` 200 但反复 401                                       | Cookie 没带上                                                                          | 检查是否误用直连跨域；确认代理原样透传 `Set-Cookie`                                 |
| Vercel 上 `/api` 返回旧数据或串号                                  | 外部 origin 响应被 CDN 缓存                                                            | 确认 `vercel.json` 的 `CDN-Cache-Control: no-store` 存在                            |
| Cloudflare `/api` 返回 503 JSON「API_ORIGIN 未配置」               | `[vars]` 被删 / 改动未推送，或 Dashboard 变量被 `wrangler deploy` 覆盖                 | 按 6.2 检查 `wrangler.toml` 的 `[vars]`（或加 `keep_vars = true`），改完 Retry      |
| Cloudflare `/api` 返回 index.html                                  | `main` / `run_worker_first` 没生效                                                     | 确认 `wrangler.toml` 与 `worker/` 已推送并重新部署                                  |
| 前端白屏但构建成功                                                 | `_redirects` 的 catch-all 被启用                                                       | 保持注释状态，SPA 回退交给 `not_found_handling`                                     |
| 上传图片 404 / 刷新后丢失                                          | 卷没挂或路径错                                                                         | `docker compose exec server ls /app/data`；确认 `ffm-data` 卷                       |
| 重启后所有人掉线                                                   | 内存 `SessionStore`                                                                    | 预期行为，见第 8 节                                                                 |
| Cloudflare Tunnel 面板里找不到 Service 输入框                      | 新版界面在 Routes → Add route → Published application；或误选了 CIDR/Connect a network | 见 4.2 第 2 步的对照表                                                              |
| `curl: (6) Could not resolve host`                                 | 照抄了占位域名，或 route 未自动创建 CNAME                                              | 换成自己的域名；在 DNS 里手动加 CNAME → `<UUID>.cfargotunnel.com`，见 4.2 第 3 步   |
| Tunnel 状态 HEALTHY 但访问返回 502                                 | Service URL 填错                                                                       | compose 同网络用 `http://server:3001`，宿主机独立跑用 `http://127.0.0.1:3001`       |
| Tunnel 返回 1016 / 1033                                            | 隧道 down / CNAME 目标写错                                                             | 见 4.2 第 4 步的错误码表                                                            |
| ngrok 上 `/api/health` 返回 HTML 警告页                            | 免费版 interstitial（ERR_NGROK_6024）                                                  | API 流量本不受影响；curl 加 `-H 'ngrok-skip-browser-warning: 1'`，Worker 已自动注入 |
| ngrok 返回 ERR_NGROK_725 / 727 或 429                              | 免费额度用尽 / 触发速率限制                                                            | Dashboard → Usage 查用量；等月度重置或升级 Hobbyist                                 |

## 11. 备选方案：前端直连后端（不推荐）

若因特殊原因必须跨域直连，需要完整改动：`client.ts` 的 `API_BASE` 改为 `import.meta.env.VITE_API_BASE_URL` 并把 `credentials` 改为 `include`；后端新增 `@fastify/cors`（`origin` 精确匹配、`credentials: true`，会改变 `pnpm-lock.yaml`）；`sessionCookieOptions` 改为 `sameSite: 'none'` + `secure: true`；全链路 HTTPS。即便如此，Safari ITP 与 Chrome 对第三方 Cookie 的限制仍会让登录态不稳定。因此本方案保持同源反代，前端零改动。

## 12. 文件清单

| 文件                              | 作用                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `Dockerfile`                      | 多阶段构建：pnpm 10.34.9 → build → `pnpm deploy --prod --legacy` → 非 root 运行 + 健康检查 |
| `.dockerignore`                   | 排除 `node_modules` / `dist` / `data` / `.env*` / `.git`，防止真实密码与数据进镜像         |
| `docker-compose.yml`              | `server` + 可选 `tls`(Caddy) / `tunnel`(Cloudflare Tunnel) / `ngrok` profile               |
| `Caddyfile`                       | TLS 终结，只暴露 `/api/*`                                                                  |
| `apps/server/.env.docker.example` | 密钥文件样例（`.env.docker` 不入库）                                                       |
| `worker/index.js`                 | Cloudflare Workers 的 `/api` 反向代理（含 ngrok 警告页跳过头）                             |
| `wrangler.toml`                   | 加 `main` / `binding` / `run_worker_first`                                                 |
| `vercel.json`                     | 加 `/api` rewrite + `CDN-Cache-Control: no-store`                                          |
| `apps/web/public/_redirects`      | 纠正「Workers 不能代理外部域名」的错误注释                                                 |
| `.gitignore`                      | 白名单 `.env.docker.example`，继续忽略 `.env.docker`                                       |
