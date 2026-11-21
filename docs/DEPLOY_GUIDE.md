# 通过 GitHub 仓库部署到 Vercel 与 Cloudflare（Pages / Workers Static Assets）

适用项目：`Frontened-function-management`（pnpm 10.34.9 + Turborepo 2 monorepo）

本指南走 **平台原生 Git 集成**：代码推送到 GitHub 后，由 Vercel / Cloudflare 自己克隆、安装依赖、构建、发布。不需要本地 Vercel CLI、Wrangler 登录或自建部署脚本。

注意：Cloudflare 现在把 GitHub 连接的静态站点**默认导入为 Workers Builds（Workers Static Assets）**，而不是传统 Pages。两者的构建配置相近，但**部署阶段完全不同**（Workers Builds 多一个 Deploy command，且用 `wrangler.toml` 而非 `pages_build_output_dir`）。先按 4.1 判断你的项目类型，再按对应小节配置。

---

## 0. 路线说明与前置约束

| 项                  | 结论                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| 部署对象            | 仅 `apps/web`（React 19 + Vite 7 静态 SPA），产物 `apps/web/dist`                |
| 不部署对象          | `apps/server`（Fastify 5 有状态服务：本地 JSON 文件、内存会话、SMTP、上传素材）  |
| 生产分支            | `master`（两边都要显式指定，GitHub 默认分支常是 `main`）                         |
| 预览分支            | `dev` 及所有 PR，两平台各自生成独立预览 URL                                      |
| 代码主仓            | Gitee；GitHub 作为 CI/CD 源（同步仓），平台和 CLI 都不访问 Gitee                 |
| Cloudflare 项目类型 | Workers Builds / Workers Static Assets（当前实际）或传统 Pages；判定与差异见 4.1 |

**为什么后端不能直接上云**：Vercel Functions 与 Cloudflare Workers/Pages 的文件系统是临时/只读的，实例之间不共享内存。当前后端的账号数据、`data/css-effect-assets/` 上传素材、内存 session 会在重启或扩容时全部丢失。默认配置下 `/api` 反代关闭，前端登录、账号管理、数据类功能不可用，属预期行为。接后端的方法见第 8 节。

**与上一轮「外部 CI + CLI 部署」路线互斥**，本轮已同步调整仓库配置：

| 文件                             | 调整                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `vercel.json`                    | 删除 `git.deploymentEnabled: false`，否则 GitHub push 不会触发 Vercel 部署                        |
| `.github/workflows/pipeline.yml` | 两个 deploy job 增加开关 `vars.EXTERNAL_CD_ENABLED == 'true'`，默认只跑质量门禁，避免与平台双部署 |
| `.gitee/workflows/pipeline.yml`  | 去掉部署与 smoke 步骤，仅保留质量门禁                                                             |
| `scripts/pipeline/deploy-*.sh`   | 保留但不自动调用，作为切回外部 CI 路线时的备选                                                    |

---

## 1. 一次性准备：把仓库同步到 GitHub

### 1.1 在 GitHub 创建空仓库

打开 `https://github.com/new`，仓库名建议与 Gitee 一致：`Frontened-function-management`。

**不要**勾选 "Add a README" / ".gitignore" / "license"，保持空仓库，否则首次推送会因历史不一致被拒绝。

### 1.2 先提交本轮配置，再推送

平台第一次构建必须能看到 `vercel.json`、`wrangler.toml`、`_redirects`、`_headers`、`.node-version`，所以先提交：

```bash
cd /Users/lizhiliang/Desktop/Gitee/Frontened-function-management

git add .gitignore vercel.json wrangler.toml .node-version \
        apps/web/public/_redirects apps/web/public/_headers \
        .github/workflows/pipeline.yml .gitee/workflows/pipeline.yml \
        scripts/pipeline docs/DEPLOY_GUIDE.md
git commit -m "chore: 增加 GitHub Git 集成部署配置与操作指南"
```

### 1.3 添加 GitHub 远程并推送两个分支

```bash
git remote add github https://github.com/<你的用户名>/Frontened-function-management.git
git push -u github master
git push github dev
```

推送完成后，在 GitHub 仓库 **Settings → General → Default branch** 把默认分支改成 `master`（或保持 `main` 并把两平台的 Production branch 都改成 `main`，二选一，不要混用）。

### 1.4 日常发版同步

Gitee 仍是开发主仓，每次发布前把变更同步到 GitHub：

```bash
git push origin HEAD && git push github HEAD
```

可配成别名省事：

```bash
git config alias.publish '!git push origin HEAD && git push github HEAD'
git publish
```

注意：不要在 GitHub 网页上直接改代码，否则下次从 Gitee 推送会冲突。如需自动同步，可在 Gitee 仓库配置推送镜像或使用定时同步任务。

---

## 2. 必须提交进仓库的配置文件清单

| 文件                                                      | 作用                                                               | 缺失后果                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `vercel.json`                                             | Vercel 构建命令、输出目录、SPA rewrites、安全头、缓存              | Vercel 可能部署仓库根目录导致空白页           |
| `wrangler.toml`                                           | Workers Builds 项目声明、`[assets]` 目录、SPA 回退                 | `wrangler deploy` 在 workspace 根目录拒绝部署 |
| `apps/web/public/_headers`                                | 安全响应头 + `/assets/*` immutable 缓存（Pages 与 Workers 均生效） | 缺安全头、缓存策略失效                        |
| `apps/web/public/_redirects`                              | 可选的后端 `/api` 反代；SPA catch-all 已注释，见下方说明           | 仅影响 `/api` 代理                            |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `package.json` | pnpm workspace 依赖解析与冻结安装                                  | 构建失败或依赖漂移                            |
| `.node-version`                                           | 固定 Node 22，Cloudflare / Vercel 都会自动读取                     | 构建镜像滚动升级导致 Node 版本漂移            |

Vite 会把 `public/` 下的文件原样复制进 `dist/`，所以 `_redirects`、`_headers` 会自动进入产物，不需要额外脚本。

**为什么 `_redirects` 里的 SPA catch-all 被注释掉了**：Workers Static Assets 的 `_redirects` 规则「无论静态文件是否命中都会先执行」，`/* /index.html 200` 会把 `/assets/*.js`、`/assets/*.css` 也 rewrite 成 index.html，造成线上白屏。SPA 回退改由 `wrangler.toml` 的 `not_found_handling = "single-page-application"` 提供（Pages 与 Workers 都正确）。只有当你改回**传统 Pages 项目**、且不使用 `wrangler.toml` 时，才需要把那行注释取消。

---

## 3. Vercel 部署（逐步）

### 3.1 导入项目

1. 打开 `https://vercel.com/new`，用 GitHub 账号登录。
2. **Import Git Repository** → 选择刚推送的 GitHub 仓库 → **Import**。
3. 若提示授权，按需授权该仓库或全部仓库。

### 3.2 Configure Project 页面

| 设置项           | 填写值                           | 说明                                               |
| ---------------- | -------------------------------- | -------------------------------------------------- |
| Framework Preset | `Vite`                           | 自动检测；若显示 `Other` 手动选 Vite               |
| Root Directory   | `./`（仓库根，不要改）           | 改成 `apps/web` 会导致 pnpm workspace 依赖解析失败 |
| Build Command    | `pnpm --filter @repo/web build`  | 已写在 `vercel.json`，Dashboard 可留空让文件生效   |
| Output Directory | `apps/web/dist`                  | 已写在 `vercel.json`，相对 Root Directory          |
| Install Command  | `pnpm install --frozen-lockfile` | 已写在 `vercel.json`                               |
| Node.js Version  | `22.x`                           | 与仓库 `.node-version` 一致                        |

注意：`vercel.json` 中的字段优先级高于 Dashboard 覆盖值，两边保持一致即可，不要只改一处。

### 3.3 环境变量（Settings → Environment Variables）

| 变量                           | 值  | 作用                                                                                                        | 环境范围             |
| ------------------------------ | --- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | 让 Vercel 读取 `package.json` 的 `packageManager: pnpm@10.34.9`，避免用镜像自带 pnpm 版本解析 lockfile 失败 | Production + Preview |

若构建日志报 `Corepack cannot find matching keyid`，改用 Dashboard 覆盖 **Install Command** 为：

```bash
npm i -g pnpm@10.34.9 && pnpm install --frozen-lockfile --prod=false
```

`--prod=false` 很关键：Vercel 构建时 `NODE_ENV=production`，不带它会导致 TypeScript、Vite、Turbo 等 devDependencies 不被安装，构建失败。

若 Vercel 日志同样出现 `Ignoring not compatible lockfile` / `ERR_PNPM_NO_LOCKFILE`，说明 `ENABLE_EXPERIMENTAL_COREPACK` 没生效、Vercel 用了镜像自带的旧 pnpm 解析锁文件；按上面的 Install Command 覆盖方式处理，原理见 4.5。

本项目前端**不注入任何 `VITE_` 变量**，因此不要把 `FFM_ADMIN_PASSWORD`、`SMTP_PASS` 等密钥放进 Vercel 环境变量，尤其不要以 `VITE_` 开头（会被打进客户端 bundle）。

### 3.4 生产分支与首次发布

- **Settings → Git → Production Branch** 设为 `master`。
- 点击 **Deploy**，等待首次构建（约 1–3 分钟）。
- 完成后得到 `https://<项目名>.vercel.app`。

### 3.5 Vercel 侧常用操作

- **预览部署**：推送 `dev` 或开 PR 自动生成独立 URL；可在 Settings → Deployment Protection 给预览加密码。
- **回滚**：Deployments → 选上一个成功部署 → `...` → **Promote to Production**（或 Instant Rollback）。
- **自定义域名**：Settings → Domains 添加，按提示配置 A / CNAME，证书自动签发。
- **跳过无关变更**：Settings → Git → Ignored Build Step 可配置路径过滤，避免只改文档也触发构建。

---

## 4. Cloudflare 部署（逐步）

### 4.1 先判断项目类型（一次性且不可回退的选择）

Cloudflare 的创建入口现在有两种，配置方式不同：

| 类型                               | 判定方式                                                                                                                                               | 部署阶段                                 | 默认域名        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------- |
| **Workers Builds / Static Assets** | Settings → Builds 里有 **Deploy command** 字段；日志末尾出现 `Failed: error occurred while running deploy command`；构建后自动跑 `npx wrangler deploy` | 由 `wrangler.toml` + Deploy command 决定 | `*.workers.dev` |
| 传统 **Pages**                     | Settings → Builds & deployments 里只有 Build command / Build output directory，无 Deploy command                                                       | 平台直接上传输出目录，不调用 Wrangler    | `*.pages.dev`   |

**当前项目属于第一种（Workers Builds）**，这也是 Cloudflare 现在的推荐方向，所以本节的部署命令按 Workers 流程给。Cloudflare 的 Git 集成与 Direct Upload 项目类型**创建后不能互相切换**，不要试图把 Direct Upload 项目改回 Git 集成。

若你确实想要传统 Pages，可以删除当前项目，走 **Workers & Pages → Create → Pages → Connect to Git** 重新创建；此时按 4.2 的「仅传统 Pages」说明填 Build output directory，并把 `_redirects` 里的 SPA catch-all 注释取消、删掉 `wrangler.toml`。

### 4.2 Set up builds and deployments

**通用设置**（两种流程都一样）：

| 设置项            | 填写值                                                            |
| ----------------- | ----------------------------------------------------------------- |
| Project name      | `ffm-web`（**必须与 `wrangler.toml` 里的 `name` 完全一致**）      |
| Production branch | `master`                                                          |
| Root directory    | 留空 / `/`（仓库根）                                              |
| Build command     | `pnpm install --frozen-lockfile && pnpm --filter @repo/web build` |

**仅传统 Pages**：Framework preset 填 `None`，Build output directory 填 `apps/web/dist`。

**仅 Workers Builds**（本项目）：输出目录由 `wrangler.toml` 的 `[assets] directory` 决定，面板上没有 Build output directory 字段；但**必须**再填这两个部署命令：

| 设置项                               | 填写值                                          |
| ------------------------------------ | ----------------------------------------------- |
| Deploy command                       | `npx wrangler deploy -c wrangler.toml`          |
| Non-production branch deploy command | `npx wrangler versions upload -c wrangler.toml` |

`-c wrangler.toml` 是**不能省略的关键参数**：裸 `npx wrangler deploy` 会在 pnpm workspace 根目录启动 application detection，因无法确定部署哪个 workspace 应用而直接报错（完整报错见 4.6）。显式指定配置文件可让 Wrangler 跳过检测。

`wrangler.toml` 的 `name` 决定部署到哪个 Worker，与 Dashboard 项目名不一致时会部署到另一个同配置不同名的 Worker，线上 URL 与面板显示的不一致，务必核对。Workers Builds 会使用 `package.json` 中声明的 Wrangler 版本；当前未声明，因此日志里出现 `npm warn exec ... wrangler@4.166.0`（平台临时安装最新版）。若要锁版本，可在根 `package.json` 的 devDependencies 加 `"wrangler": "4.166.0"` 并把部署命令改成 `pnpm exec wrangler deploy -c wrangler.toml`。

**Root directory 藏在 Advanced settings 折叠面板里**，需要展开才能看到。monorepo 最常见的首部翻车就是这一项：填错时构建会成功、部署也成功，但线上是 404 或空白页，且日志里没有任何报错。

**Build command 之前还有一步自动安装**：Cloudflare 在执行你填的 Build command **之前**，会先跑平台自带的「自动依赖安装」`pnpm install --frozen-lockfile`，日志里 `Installing project dependencies: ...` 就是它。这一步用的 pnpm 由 `PNPM_VERSION` 决定，**不受你的 Build command 控制**；第一次失败就发生在这一步，所以当时改 Build command 是无效的。配合 `SKIP_DEPENDENCY_INSTALL=1` 可以关掉它，让安装只由 Build command 执行一次。

**备选方案**（仅当 output directory 不接受嵌套路径时使用）：Root directory 填 `apps/web`，Build command 改成 `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @repo/web build`；Workers 流程下还要把 `wrangler.toml` 的 `directory` 改成相对新根目录能找到的路径。

### 4.3 环境变量（Settings → Environment variables）

按下面表格设置，**Production 与 Preview 两套环境都要各加一遍**（Cloudflare 环境变量按环境隔离，只加 Production 时预览分支的部署仍会用旧值）。其中 `PNPM_VERSION` 是修复 lockfile 报错的必要条件：

| 变量                      | 值        | 作用                                                                                                                                                            |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PNPM_VERSION`            | `10.34.9` | **最关键**。v3 镜像默认 pnpm 10.11.1（v2 更低），且 v3 明确不支持从 `pnpm-lock.yaml` 或 `package.json` 推断 pnpm 版本；必须显式对齐 `packageManager` 的精确版本 |
| `SKIP_DEPENDENCY_INSTALL` | `1`       | 关闭平台自动安装，避免与 Build command 里的安装重复执行，让依赖解析完全由仓库命令控制                                                                           |
| `NODE_VERSION`            | `22`      | 固定 Node 22（v3 默认 22.23.4，会滚动更新）；仓库内 `.node-version` 已写 `22`，两处保持一致即可                                                                 |

变量值不要加引号、不要带 `v` 前缀。密钥类变量（若以后接入）勾选 **Encrypt**，保存后不可再查看明文。

**改完环境变量或部署命令必须重新触发一次部署**：Cloudflare 不会把新配置应用到已经排队或正在运行的构建。用 Deployments → 失败的那次 → **Retry deployment**，或在 Settings → Deploy hooks 触发一次。

**自检方式**：看构建日志开头的 `Detected the following tools from environment: ...`。正确结果应类似 `pnpm@10.34.9, npm@10.x.x, nodejs@22.x.x`；若仍是 `pnpm@9.x` / `nodejs@24.x`，说明变量没保存、加错了环境（Preview 与 Production 是两套）、或该项目还停留在旧构建镜像。

### 4.4 首次发布与后续

Workers Builds 项目默认域名是 `https://<name>.<账户子域>.workers.dev`（**不是** `*.pages.dev`），以 Dashboard 显示的 URL 为准。

**首次部署顺序有讲究**：先 push 到 `master`，让 `npx wrangler deploy -c wrangler.toml` 创建 Worker；之后预览分支的 `wrangler versions upload` 才能工作（首次上传 Worker 不能用 `versions upload`）。预览部署会生成版本 URL，需要发布时在 Deployments 里 Promote。

- **回滚**：Workers → Deployments → 选历史版本 → Rollback / Promote；Pages → Deployments → Rollback。
- **自定义域名**：Workers 的自定义域名要求该域名的 DNS 由 Cloudflare 托管（与 Pages 不同，Pages 支持外部 DNS 用 CNAME 指向 `*.pages.dev`）。
- **部署钩子**：Settings → Deploy hooks 可生成 URL 用于手动触发重建。

### 4.5 故障复盘：`ERR_PNPM_NO_LOCKFILE` / `Ignoring not compatible lockfile`

2026-11-21 首次 Cloudflare 构建失败，日志：

```text
Detected the following tools from environment: pnpm@9.10.0, npm@10.9.2, nodejs@24.22.1
Installing project dependencies: pnpm install --frozen-lockfile
(node:182) [DEP0169] DeprecationWarning: url.parse() ...
WARN  Ignoring not compatible lockfile at /opt/buildhome/repo/pnpm-lock.yaml
ERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is absent
Failed: error occurred while installing tools or dependencies
```

**根因链**（顺序不能弄反）：

1. `pnpm-lock.yaml` 由 pnpm 10.34.9 生成（`lockfileVersion: '9.0'`，含 `catalogs:` 段），但平台环境里是 pnpm 9.10.0，且 4.3 的三个变量一个都没生效。
2. pnpm 9 判定该 lockfile 与自身不兼容，**直接忽略它**（`Ignoring not compatible lockfile`），于是「看起来 lockfile 不存在」。
3. `pnpm install --frozen-lockfile` 要求 lockfile 存在且不可改，于是报 `ERR_PNPM_NO_LOCKFILE`。报错里的 `absent` 是误导 —— **文件确实已提交在仓库里**，只是被旧版 pnpm 无视了。
4. 这一行来自平台**自动依赖安装**阶段，发生在 Build command 之前，所以错误跟你在 Build command 里写什么无关。

**修复**：`PNPM_VERSION=10.34.9` 是必要条件 —— 它让平台自带的自动安装阶段也用 pnpm 10.34.9；再配 `SKIP_DEPENDENCY_INSTALL=1` 去掉重复安装，按 4.3 设置后 Retry deployment。成功时应看到 `Lockfile is up to date, resolution step is skipped`。只设 `SKIP_DEPENDENCY_INSTALL=1` 而不设 `PNPM_VERSION` 修不好，因为 Build command 里的 `pnpm` 仍是 9.x。

**两个不要做的「修复」**：

- 不要改成 `pnpm install --no-frozen-lockfile`：这会让 CI 用 pnpm 9 重新解析并**改写** lockfile，构建变绿，但仓库里的锁文件与线上依赖树脱节，等于把廉价的前置失败换成昂贵的线上事故。
- 不要删除 `pnpm-lock.yaml` 或降级 `.npmrc`：会丢掉全部锁定的传递依赖版本，同样破坏可复现性。

**兜底方案**（若 `PNPM_VERSION` 在该项目里始终不生效，例如项目仍停留在 v2 构建镜像）：把 Build command 换成自带 pnpm 版本的自包含命令，不再依赖平台 PATH 里的 pnpm：

```bash
npm i -g pnpm@10.34.9 && pnpm install --frozen-lockfile --prod=false && pnpm --filter @repo/web build
```

`SKIP_DEPENDENCY_INSTALL=1` 仍要设。`--prod=false` 保证 Vite / TypeScript / Turbo 等 devDependencies 被安装。

### 4.6 故障复盘：`application detection logic ... root of a workspace`

2026-11-21 第二次失败：pnpm 版本修复后构建已成功，但部署阶段报错：

```text
npm warn exec The following package was not found and will be installed: wrangler@4.166.0
wrangler 4.166.0
[ERROR] The Cloudflare application detection logic has been run in the root of a workspace
   instead of targeting a specific project. Change your working directory to one of the
   applications in the workspace and try again.
Failed: error occurred while running deploy command
```

**根因**：这个项目是 **Workers Builds** 而非传统 Pages，构建后平台会执行独立的 Deploy command（默认裸 `npx wrangler deploy`）。Wrangler 4 在 `pnpm-workspace.yaml` 所在的 workspace 根目录运行时会启动 application detection，试图推断要部署哪个 workspace 应用；根目录不是具体应用、仓库里又没有任何 Wrangler 配置，于是拒绝猜测并报错。**这与 pnpm 版本无关，是部署阶段的独立问题**。

**修复（两步，缺一不可）**：

1. 把 `wrangler.toml` 提交到仓库根并推送到 GitHub —— 它声明 `name`、`[assets] directory = "apps/web/dist"` 和 `not_found_handling = "single-page-application"`，给 Wrangler 一个明确目标。
2. 在 Dashboard 的 Builds 设置里把 Deploy command 改为 `npx wrangler deploy -c wrangler.toml`，Non-production branch deploy command 改为 `npx wrangler versions upload -c wrangler.toml`，然后 Retry deployment。

只加配置文件、不写 `-c` 仍可能触发 detection；只写 `-c`、不提交配置文件则会报「找不到配置」。另外确认 `wrangler.toml` 的 `name` 与 Dashboard 项目名一致，以及当前部署的 commit 里确实包含该文件（部署日志里 Wrangler 会显示读取到的配置）。

**连带修正（否则会白屏）**：Workers Static Assets 中 `_redirects` 的规则无论静态文件是否命中都会先执行，原来的 `/* /index.html 200` 会把 `/assets/*.js`、`/assets/*.css` 一并 rewrite 成 index.html。因此该文件里的 catch-all 已注释，SPA 回退改由 `not_found_handling` 提供。`_headers` 在 Workers 下继续生效，安全头与 immutable 缓存不受影响。

**想改回传统 Pages**：删除当前 Workers 项目，用 Create → **Pages** → Connect to Git 重建，填 Build output directory `apps/web/dist`，取消 `_redirects` 中 catch-all 的注释，并删除 `wrangler.toml`（Pages 用 `pages_build_output_dir`，不读 `[assets]`）。注意 Workers 的自定义域名要求 DNS 托管在 Cloudflare，重建前先确认有无绑定域名。

---

## 5. 两个平台同时运行

同一个 GitHub 仓库可以同时授权给 Vercel 和 Cloudflare，两边各自独立克隆与构建，互不干扰。建议：

- 主域名绑在一个平台，另一个作为备用/灾备或团队预览。
- 两边都会为每个 PR 创建预览部署，免费额度消耗会翻倍；可在其中一边的 Settings 关闭非生产分支自动部署。
- 两边构建配置必须保持同版本（Node 22、pnpm 10.34.9），否则容易出现「一边能构建、一边失败」。

---

## 6. 部署后验证清单

用仓库内脚本（它检查首页、SPA 深链回退、产物引用），URL 以 Dashboard 显示为准（Workers 是 `*.workers.dev`，Pages 是 `*.pages.dev`）：

```bash
bash scripts/pipeline/smoke.sh https://<项目名>.vercel.app
bash scripts/pipeline/smoke.sh https://<Cloudflare 生产域名>
```

再手工确认响应头：

```bash
curl -sI https://<CF 域名>/ | grep -iE 'x-frame-options|x-content-type|cache-control'
curl -sI https://<CF 域名>/assets/index-xxxx.js | grep -i cache-control
```

期望：`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`；HTML `no-cache`；`/assets/*` 为 `public, max-age=31536000, immutable`。

浏览器里额外验证：访问 `/`、`/accounts`（或任意前端路由）后**硬刷新**，都应是 200 而不是 404；同时打开 DevTools 确认 JS/CSS 返回的是真实文件内容而不是 `index.html` 的 HTML —— 这是 SPA 回退没有抢在静态资源之前的标志。

---

## 7. 回滚

| 方式                   | 操作                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Vercel                 | Deployments → 历史成功部署 → Promote to Production / Instant Rollback     |
| Cloudflare Workers     | Deployments → 选历史版本 → Rollback / Promote                             |
| Cloudflare Pages       | 项目 → Deployments → 历史部署 → Rollback                                  |
| 通用（两平台同时回滚） | `git revert <坏提交SHA>` 后 `git publish`，两边都会自动重新部署上一版代码 |

平台回滚只换部署、不改代码；`git revert` 会让代码与线上保持一致，生产环境推荐后者。

---

## 8. 可选进阶：接回有状态后端

后端必须部署在**长驻进程**环境（容器 / 轻量服务器 / Fly.io / Railway 等），或先做无状态化改造（外置数据库 + 对象存储 + 签名会话）。拿到公网 HTTPS 域名 `https://api.example.com` 后：

**Vercel**：在 `vercel.json` 的 `rewrites` 数组**最前面**插入一条（顺序敏感，`/(.*)` 必须在最后）：

```json
{ "source": "/api/:path*", "destination": "https://api.example.com/api/:path*" }
```

**Cloudflare**：取消 `apps/web/public/_redirects` 中 `/api/*` 那行的注释并替换域名（`_redirects` 在 Pages 与 Workers Static Assets 下都生效）：

```text
/api/*  https://api.example.com/api/:splat  200
```

不要顺手把 SPA catch-all 也取消注释，原因见 4.6。因为浏览器看到的仍是前端同源域名（平台做反向代理），HttpOnly Cookie 不会因跨站失效，无需改 `SameSite`。

后端环境变量 `FFM_ADMIN_PASSWORD`、`FFM_ADMIN_USERNAME`、`SMTP_HOST/PORT/USER/PASS/FROM` 只配置在后端服务上，**绝不**放进 Vercel / Cloudflare 的前端项目环境变量。接好后可在 CI 里设 `SMOKE_API=1` 启用 `/api/health` 探针。

---

## 9. 可选：切回「外部 CI + CLI 部署」路线

若要恢复上一轮的自定义流水线（自己控制审批、产物晋升、双平台 CLI 发布），按顺序做：

1. GitHub 仓库 Settings → Variables 新增 `EXTERNAL_CD_ENABLED` = `true`（启用 `.github/workflows/pipeline.yml` 的两个 deploy job）。
2. `vercel.json` 加回 `"git": { "deploymentEnabled": false }`，关闭 Vercel Git 自动部署，避免双部署。
3. 在 GitHub Secrets 填 `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`，或 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`；变量填 `CF_PAGES_PROJECT`、`VERCEL_CLI_VERSION`、`WRANGLER_CLI_VERSION`（锁定具体版本，不要用 `latest`）。
4. Cloudflare 侧：Workers 项目用 `wrangler deploy -c wrangler.toml`，传统 Pages / Direct Upload 项目用 `wrangler pages deploy`。Git 集成与 Direct Upload 项目类型创建后不可互切；若要用 `wrangler pages deploy`，需另建 Direct Upload 项目并改用 `scripts/pipeline/deploy-cloudflare.sh`。
5. Gitee Go 若要承担部署，在 `.gitee/workflows/pipeline.yml` 末尾补回 `deploy-cloudflare.sh` / `deploy-vercel.sh` 与 `smoke.sh` 两步。

---

## 10. 常见故障排查

| 现象                                                        | 原因                                                    | 修复                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 线上空白页 / 404，但构建日志成功                            | Root Directory 或 Build output directory 指错           | Vercel/CF 都保持仓库根 + `apps/web/dist`                                           |
| 深链接硬刷新 404                                            | `not_found_handling` 未生效，或 catch-all 被误注释      | Workers 看 `wrangler.toml`；传统 Pages 取消 `_redirects` catch-all 注释            |
| Vercel push 后完全不部署                                    | `vercel.json` 残留 `git.deploymentEnabled: false`       | 删除该字段（本轮已删）                                                             |
| 同一次 push 产生两个部署                                    | `.github/workflows/pipeline.yml` 的 deploy job 仍在跑   | 保持 `EXTERNAL_CD_ENABLED` 未设置（默认 false）                                    |
| `Ignoring not compatible lockfile` + `ERR_PNPM_NO_LOCKFILE` | 平台 pnpm 版本低于生成 lockfile 的版本，锁文件被无视    | CF 设 `PNPM_VERSION=10.34.9` + `SKIP_DEPENDENCY_INSTALL=1` 后 Retry，详见 4.5      |
| `application detection logic ... root of a workspace`       | Workers Builds 跑裸 `wrangler deploy`，无 Wrangler 配置 | 提交 `wrangler.toml` + Deploy command 加 `-c wrangler.toml`，详见 4.6              |
| `Detected ... pnpm@9.x` / 变量改了没变化                    | 变量没保存、只加了 Production、或没重新触发部署         | 两套环境都加；改完 Retry deployment；检查日志首行                                  |
| `pnpm: command not found` / `ERR_PNPM_OUTDATED_LOCKFILE`    | 平台 pnpm 版本不符，或 lockfile 与 package.json 不同步  | Vercel 设 `ENABLE_EXPERIMENTAL_COREPACK=1`；本地 `pnpm install` 后一并提交两个文件 |
| `Cannot find module 'vite'` / `tsc`                         | `NODE_ENV=production` 下 devDependencies 未安装         | Install Command 加 `--prod=false`                                                  |
| `Corepack cannot find matching keyid`                       | Corepack 签名密钥过旧                                   | 改用 `npm i -g pnpm@10.34.9 && pnpm install --frozen-lockfile --prod=false`        |
| 构建成功但 JS/CSS 返回 HTML                                 | Workers 下 `_redirects` catch-all 拦截了静态资源        | 注释掉 `/* /index.html 200`，用 `not_found_handling` 做 SPA 回退                   |
| 改了配置但线上没变化                                        | 配置没提交，或只推了 Gitee 没推 GitHub                  | `git add` + `commit` + `git publish`                                               |

---

## 11. 安全与运维红线

- `.env.local`、`apps/server/data/`、`.vercel/`、`.wrangler/`、`deployment-url.txt` 已在 `.gitignore` 中，任何真实密码、Token、账号数据都不得入库。
- 平台侧密钥按最小权限、按环境（Production / Preview）分别配置，Production 的值不要复用到 Preview。
- 生产分支 `master` 建议在 GitHub 开启分支保护（要求 CI 门禁通过后才允许合并）。
- 每次发布在 Job Summary / 部署详情页记录 commit SHA 与产物指纹（`scripts/pipeline/build.sh` 会输出 `dist-sha256`），便于定位线上版本。
- 目前构建产物单个 JS 约 2.75 MB（gzip 约 895 KB），Vite 已给出分包警告；建议后续用动态 `import()` 或 `manualChunks` 拆分，否则首屏性能会成为可靠性短板。
