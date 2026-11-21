#!/usr/bin/env bash
# Cloudflare Pages Direct Upload：严格复用 CI 已构建的 apps/web/dist，不二次构建。
# 用法: deploy-cloudflare.sh <preview|production> [branch]
# 凭据走环境变量：CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / CF_PAGES_PROJECT
#   WRANGLER_CLI_VERSION  建议锁定，如 wrangler@4.45.0（未设置时回退 latest，仅用于试跑）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${CLOUDFLARE_API_TOKEN:?缺少 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?缺少 CLOUDFLARE_ACCOUNT_ID}"
: "${CF_PAGES_PROJECT:?缺少 CF_PAGES_PROJECT}"

MODE="${1:-preview}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
CLI_SPEC="${WRANGLER_CLI_VERSION:-wrangler@latest}"
[ "$MODE" = "production" ] && BRANCH="${CF_PRODUCTION_BRANCH:-master}"

pnpm dlx "$CLI_SPEC" pages deploy apps/web/dist \
  --project-name="$CF_PAGES_PROJECT" \
  --branch="$BRANCH" 2>&1 | tee deploy.log

URL="$(grep -oE 'https://[A-Za-z0-9._-]+\.pages\.dev' deploy.log | tail -n 1 || true)"
case "$URL" in
  https://*) printf '%s\n' "$URL" > deployment-url.txt ;;
  *) echo "::error::未能从 Wrangler 输出解析部署 URL" >&2; exit 1 ;;
esac
echo "cloudflare pages deployment ($MODE / $BRANCH): $URL"
