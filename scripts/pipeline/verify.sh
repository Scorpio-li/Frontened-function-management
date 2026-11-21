#!/usr/bin/env bash
# 质量门禁：fail fast，成本从低到高依次执行。本地与任意 CI 均可直接运行。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "::group::lint"
pnpm lint
echo "::endgroup::"

echo "::group::typecheck"
pnpm typecheck
echo "::endgroup::"

echo "::group::test"
pnpm test
echo "::endgroup::"

# 构建由 build.sh 单独负责（CI 中作为独立 job 归档产物），此处不重复构建
echo "verify OK @ $(git rev-parse --short HEAD)（构建请执行 scripts/pipeline/build.sh）"
