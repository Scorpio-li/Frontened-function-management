#!/usr/bin/env bash
# 部署后冒烟检查：首页、SPA 深链回退、构建产物引用、（可选）后端健康探针
# 用法: smoke.sh <部署URL>  或  smoke.sh "$(cat deployment-url.txt)"
set -euo pipefail
URL="${1:?用法: smoke.sh <部署URL>}"
URL="${URL%/}"

check() {
  local path="$1" expected="${2:-200}" code
  code="$(curl -sS -o /tmp/ffm-smoke-body -w '%{http_code}' --max-time 20 "$URL$path")"
  echo "GET $path -> $code (期望 $expected)"
  [ "$code" = "$expected" ] || { echo "::error::$path 返回 $code" >&2; exit 1; }
}

check /
check /-smoke-deep-link-            # 验证 SPA fallback 生效，硬刷新不 404
curl -fsS --max-time 20 "$URL/" | grep -q '/assets/' || {
  echo "::error::index.html 未引用 /assets/，部署产物可能不是最新构建" >&2
  exit 1
}

if [ -n "${SMOKE_API:-}" ]; then
  check /api/health                 # 仅在 /api 已反代到真实后端时启用
fi

echo "SMOKE OK @ $URL"
