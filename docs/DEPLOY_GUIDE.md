# 通过 GitHub 仓库部署到 Vercel 与 Cloudflare Pages

适用项目：`Frontened-function-management`（pnpm 10.34.9 + Turborepo 2 monorepo）

本指南走 **平台原生 Git 集成**：代码推送到 GitHub 后，由 Vercel / Cloudflare Pages 自己克隆、安装依赖、构建、发布。不需要 Vercel CLI、Wrangler、Token 或自建部署脚本。

---

## 0. 路线说明与前置约束

| 项         | 结论                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| 部署对象   | 仅 `apps/web`（React 19 + Vite 7 静态 SPA），产物 `apps/web/dist`               |
| 不部署对象 | `apps/server`（Fastify 5 有状态服务：本地 JSON 文件、内存会话、SMTP、上传素材） |
| 生产分支   | `master`（两边都要显式指定，GitHub 默认分支常是 `main`）                        |
| 预览分支   | `dev` 及所有 PR，两平台各自生成独立预览 URL                                     |
| 代码主仓   | Gitee；GitHub 作为 CI/CD 源（同步仓），平台和 CLI 都不访问 Gitee                |

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

平台第一次构建必须能看到 `vercel.json`、`_redirects`、`_headers`，所以先提交：

```bash
cd /Users/lizhiliang/Desktop/Gitee/Frontened-function-management

git add .gitignore vercel.json \
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

| 文件                                                      | 作用                                                  | 缺失后果                            |
| --------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| `vercel.json`                                             | Vercel 构建命令、输出目录、SPA rewrites、安全头、缓存 | Vercel 可能部署仓库根目录导致空白页 |
| `apps/web/public/_redirects`                              | Cloudflare SPA 回退 `/* /index.html 200`              | 深链接硬刷新 404                    |
| `apps/web/public/_headers`                                | 安全响应头 + `/assets/*` immutable 缓存               | 缺安全头、缓存策略失效              |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `package.json` | pnpm workspace 依赖解析与冻结安装                     | 构建失败或依赖漂移                  |

Vite 会把 `public/` 下的文件原样复制进 `dist/`，所以 `_redirects`、`_headers` 会自动进入产物，不需要额外脚本。

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
| Node.js Version  | `22.x`                           | 与本地已验证的 Node 22 一致                        |

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

## 4. Cloudflare Pages 部署（逐步）

### 4.1 创建项目（一次性且不可回退的选择）

1. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**。
2. 授权 GitHub 并选择仓库。

**关键决策**：必须选 **Connect to Git**。Cloudflare Pages 的「Git 集成」与「Direct Upload / Drag and drop」是两种项目类型，**创建后不能互相切换**。如果你之前用 `wrangler pages deploy` 建过同名 Direct Upload 项目，需要换一个项目名重新用 Git 集成创建。

### 4.2 Set up builds and deployments

| 设置项                 | 填写值                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| Project name           | `ffm-web`（自定义，决定 `*.pages.dev` 域名）                      |
| Production branch      | `master`                                                          |
| Framework preset       | `None`（手动填更可控；选 `Vite` 也可，但需核对下面的命令）        |
| Root directory         | 留空 / `/`（仓库根）                                              |
| Build command          | `pnpm install --frozen-lockfile && pnpm --filter @repo/web build` |
| Build output directory | `apps/web/dist`                                                   |

**Root directory 藏在 Advanced settings 折叠面板里**，需要展开才能看到。monorepo 最常见的首部翻车就是这一项：填错时构建会成功、部署也成功，但线上是 404 或空白页，且日志里没有任何报错。

**备选方案**（仅当 output directory 不接受嵌套路径时使用）：Root directory 填 `apps/web`，Build command 改成 `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @repo/web build`，Build output directory 填 `dist`。

### 4.3 环境变量（Settings → Environment variables）

Production 与 Preview 两套都要加：

| 变量                      | 值        | 作用                                                                                          |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `NODE_VERSION`            | `22`      | v3 构建镜像默认 Node 22.16.0，显式固定避免镜像升级导致漂移                                    |
| `PNPM_VERSION`            | `10.34.9` | v3 默认 pnpm 10.11.1，与项目 `packageManager` 不一致，必须显式覆盖                            |
| `SKIP_DEPENDENCY_INSTALL` | `1`       | 跳过平台自动安装，由 Build command 里的 `pnpm install --frozen-lockfile` 全权负责，保证可复现 |

密钥类变量（若以后接入）勾选 **Encrypt**，保存后不可再查看明文。

### 4.4 首次发布与后续

点击 **Save and Deploy**，等待构建完成，得到 `https://<hash>.ffm-web.pages.dev` 与生产域名 `https://ffm-web.pages.dev`。

之后每次 push 到 `master` 自动更新生产，其他分支与 PR 自动生成预览部署。

- **回滚**：项目 → Deployments → 选历史部署 → **Rollback**。
- **自定义域名**：Custom domains → Set up a custom domain；DNS 在 Cloudflare 时可一键 CNAME，外部 DNS 需手动添加 CNAME 指向 `*.pages.dev`。
- **部署钩子**：Settings → Deploy hooks 可生成 URL 用于手动触发重建。

---

## 5. 两个平台同时运行

同一个 GitHub 仓库可以同时授权给 Vercel 和 Cloudflare Pages，两边各自独立克隆与构建，互不干扰。建议：

- 主域名绑在一个平台，另一个作为备用/灾备或团队预览。
- 两边都会为每个 PR 创建预览部署，免费额度消耗会翻倍；可在其中一边的 Settings 关闭非生产分支自动部署。
- 两边构建配置必须保持同版本（Node 22、pnpm 10.34.9），否则容易出现「一边能构建、一边失败」。

---

## 6. 部署后验证清单

用仓库内脚本（它检查首页、SPA 深链回退、产物引用）：

```bash
bash scripts/pipeline/smoke.sh https://<项目名>.vercel.app
bash scripts/pipeline/smoke.sh https://ffm-web.pages.dev
```

再手工确认响应头：

```bash
curl -sI https://ffm-web.pages.dev/ | grep -iE 'x-frame-options|x-content-type|cache-control'
curl -sI https://ffm-web.pages.dev/assets/index-xxxx.js | grep -i cache-control
```

期望：`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`；HTML `no-cache`；`/assets/*` 为 `public, max-age=31536000, immutable`。

浏览器里额外验证：访问 `/`、`/accounts`（或任意前端路由）后**硬刷新**，都应是 200 而不是 404，这是 SPA fallback 生效的标志。

---

## 7. 回滚

| 方式                   | 操作                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Vercel                 | Deployments → 历史成功部署 → Promote to Production / Instant Rollback     |
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

**Cloudflare Pages**：取消 `apps/web/public/_redirects` 中 `/api/*` 那行的注释并替换域名：

```text
/api/*  https://api.example.com/api/:splat  200
```

因为浏览器看到的仍是前端同源域名（平台做反向代理），HttpOnly Cookie 不会因跨站失效，无需改 `SameSite`。

后端环境变量 `FFM_ADMIN_PASSWORD`、`FFM_ADMIN_USERNAME`、`SMTP_HOST/PORT/USER/PASS/FROM` 只配置在后端服务上，**绝不**放进 Vercel / Cloudflare 的前端项目环境变量。接好后可在 CI 里设 `SMOKE_API=1` 启用 `/api/health` 探针。

---

## 9. 可选：切回「外部 CI + CLI 部署」路线

若要恢复上一轮的自定义流水线（自己控制审批、产物晋升、双平台 CLI 发布），按顺序做：

1. GitHub 仓库 Settings → Variables 新增 `EXTERNAL_CD_ENABLED` = `true`（启用 `.github/workflows/pipeline.yml` 的两个 deploy job）。
2. `vercel.json` 加回 `"git": { "deploymentEnabled": false }`，关闭 Vercel Git 自动部署，避免双部署。
3. 在 GitHub Secrets 填 `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`，或 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`；变量填 `CF_PAGES_PROJECT`、`VERCEL_CLI_VERSION`、`WRANGLER_CLI_VERSION`（锁定具体版本，不要用 `latest`）。
4. Cloudflare 需**新建 Direct Upload 项目**（Git 集成项目不能改成 Direct Upload），用 `scripts/pipeline/deploy-cloudflare.sh` 发布。
5. Gitee Go 若要承担部署，在 `.gitee/workflows/pipeline.yml` 末尾补回 `deploy-cloudflare.sh` / `deploy-vercel.sh` 与 `smoke.sh` 两步。

---

## 10. 常见故障排查

| 现象                                            | 原因                                                  | 修复                                                                        |
| ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| 线上空白页 / 404，但构建日志成功                | Root Directory 或 Build output directory 指错         | Vercel/CF 都保持仓库根 + `apps/web/dist`                                    |
| 深链接硬刷新 404                                | `_redirects` 未进 dist，或 Vercel rewrites 被覆盖     | 确认 `apps/web/public/_redirects` 已提交、产物里有该文件                    |
| Vercel push 后完全不部署                        | `vercel.json` 残留 `git.deploymentEnabled: false`     | 删除该字段（本轮已删）                                                      |
| 同一次 push 产生两个部署                        | `.github/workflows/pipeline.yml` 的 deploy job 仍在跑 | 保持 `EXTERNAL_CD_ENABLED` 未设置（默认 false）                             |
| `pnpm: command not found` / lockfile 版本不兼容 | 平台自带 pnpm 版本与 `packageManager` 不符            | Vercel 设 `ENABLE_EXPERIMENTAL_COREPACK=1`；CF 设 `PNPM_VERSION=10.34.9`    |
| `Cannot find module 'vite'` / `tsc`             | `NODE_ENV=production` 下 devDependencies 未安装       | Install Command 加 `--prod=false`                                           |
| `Corepack cannot find matching keyid`           | Corepack 签名密钥过旧                                 | 改用 `npm i -g pnpm@10.34.9 && pnpm install --frozen-lockfile --prod=false` |
| 构建成功但 JS/CSS 返回 HTML                     | rewrites 抢在静态文件之前                             | 确认 `/(.*)` 是最后一条 rewrite                                             |
| 改了配置但线上没变化                            | 配置没提交，或只推了 Gitee 没推 GitHub                | `git add` + `commit` + `git publish`                                        |

---

## 11. 安全与运维红线

- `.env.local`、`apps/server/data/`、`.vercel/`、`.wrangler/`、`deployment-url.txt` 已在 `.gitignore` 中，任何真实密码、Token、账号数据都不得入库。
- 平台侧密钥按最小权限、按环境（Production / Preview）分别配置，Production 的值不要复用到 Preview。
- 生产分支 `master` 建议在 GitHub 开启分支保护（要求 CI 门禁通过后才允许合并）。
- 每次发布在 Job Summary / 部署详情页记录 commit SHA 与产物指纹（`scripts/pipeline/build.sh` 会输出 `dist-sha256`），便于定位线上版本。
- 目前构建产物单个 JS 约 2.75 MB（gzip 约 895 KB），Vite 已给出分包警告；建议后续用动态 `import()` 或 `manualChunks` 拆分，否则首屏性能会成为可靠性短板。
