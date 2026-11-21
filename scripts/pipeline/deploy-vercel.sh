#!/usr/bin/env bash
# Vercel 外部流水线：vercel pull -> vercel build -> vercel deploy --prebuilt
# 用法: deploy-vercel.sh <preview|production>
# 凭据走环境变量（不出现在命令行/进程列表）：
#   VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID
#   VERCEL_CLI_VERSION  建议锁定，如 vercel@48.1.0（未设置时回退 latest，仅用于试跑）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${VERCEL_TOKEN:?缺少 VERCEL_TOKEN}"
: "${VERCEL_ORG_ID:?缺少 VERCEL_ORG_ID}"
: "${VERCEL_PROJECT_ID:?缺少 VERCEL_PROJECT_ID}"

MODE="${1:-preview}"
CLI_SPEC="${VERCEL_CLI_VERSION:-vercel@latest}"

if [ "$MODE" = "production" ]; then
  pnpm dlx "$CLI_SPEC" pull --yes --environment=production
  pnpm dlx "$CLI_SPEC" build --prod
  pnpm dlx "$CLI_SPEC" deploy --prebuilt --prod > deployment-url.txt
else
  pnpm dlx "$CLI_SPEC" pull --yes --environment=preview
  pnpm dlx "$CLI_SPEC" build
  pnpm dlx "$CLI_SPEC" deploy --prebuilt > deployment-url.txt
fi

URL="$(tail -n 1 deployment-url.txt | tr -d '\r' | tr -d ' ')"
case "$URL" in
  https://*) printf '%s\n' "$URL" > deployment-url.txt ;;
  *) echo "::error::未能从 Vercel CLI 输出解析部署 URL: $URL" >&2; exit 1 ;;
esac
echo "vercel deployment ($MODE): $URL"
