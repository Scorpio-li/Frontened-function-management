# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# FFM 后端镜像（pnpm 10 + Turborepo monorepo）
#
# 构建上下文必须是仓库根目录：
#   docker compose build
#   docker build -f Dockerfile -t ffm-server:local .
#
# 设计要点见 docs/DOCKER_DEPLOY.md 第 2 节。
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS builder
WORKDIR /repo

ENV HUSKY=0 \
    CI=true

# pnpm 版本必须与根 package.json 的 packageManager (pnpm@10.34.9) 精确一致。
# pnpm 9 会忽略 lockfileVersion '9.0' 的锁文件并以 frozen-lockfile 报错
# （Cloudflare 构建已踩过：WARN Ignoring not compatible lockfile）。
RUN npm install -g pnpm@10.34.9 \
 && pnpm --version

# .dockerignore 已排除 node_modules / dist / data / .env* / .git 等。
COPY . .

RUN pnpm install --frozen-lockfile

# 先构建 @repo/contracts（pnpm deploy 只打包它的 dist/），再构建 server。
# 使用 filter 的 "..." 语法按拓扑顺序执行，等价于 turbo 的 dependsOn: ["^build"]。
RUN pnpm --filter @repo/server... build

# pnpm deploy 生成自包含的生产依赖目录（只含 prod 依赖）。
# --legacy：pnpm 10 默认要求 inject-workspace-packages=true，本仓库未开启；
#          官方明确允许用 --legacy 走旧实现，不改动仓库配置。
# --prod：不带 tsup / vitest / typescript 等 devDependencies。
RUN pnpm deploy --filter @repo/server --prod --legacy /app/standalone

# 关键修正：@repo/contracts 的 exports.default 指向 src/index.ts，但 deploy
# 受 package.json "files": ["dist"] 限制只带上了 dist/。若不改，容器启动会
# 直接 ERR_MODULE_NOT_FOUND。改成指向已编译的 dist/index.js 后，产物不再依赖
# Node 22.18+ 的 TypeScript 类型剥离，任何 Node >=20.19 都能运行。
# 先 rmSync 再写入：deploy 产物里的 package.json 可能与 /repo 源文件是硬链接，
# 直接 writeFileSync 会连带污染 builder 阶段的源文件（虽然 runner 不受影响）。
RUN node -e "const fs=require('node:fs');const p='/app/standalone/node_modules/@repo/contracts/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}};fs.rmSync(p,{force:true});fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');" \
 && test -f /app/standalone/node_modules/@repo/contracts/dist/index.js \
 && cd /app/standalone \
 && rm -rf src tsconfig.json .turbo .env.example .env.local data

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

# FFM_HOST 必须显式设为 0.0.0.0：config.ts 的默认值是 127.0.0.1，
# 容器内监听 loopback 会导致端口映射「通但拒绝连接」。
ENV NODE_ENV=production \
    FFM_HOST=0.0.0.0 \
    FFM_PORT=3001 \
    FFM_DATA_DIR=/app/data

WORKDIR /app

COPY --from=builder --chown=node:node /app/standalone/ /app/

# 数据目录必须属于 node 用户；compose 中挂载 named volume 覆盖此目录。
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3001

# 用 Node 内置 fetch 做健康检查，slim 镜像无需额外安装 curl。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.FFM_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
