#!/usr/bin/env bash
# 单次构建（build once）：产出唯一一份静态产物 apps/web/dist，供 preview / production 复用。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# pnpm 版本由 CI 的 pnpm/action-setup 固定（与 packageManager 一致）；本地请先 corepack enable
command -v pnpm >/dev/null 2>&1 || { echo "::error::未找到 pnpm，请先执行 corepack enable" >&2; exit 1; }
pnpm --version
pnpm install --frozen-lockfile
pnpm build

# 产物完整性校验：缺任何一项都会让线上 SPA 或安全头静默失效
for f in index.html _redirects _headers; do
  if [ ! -f "apps/web/dist/$f" ]; then
    echo "::error::构建产物缺少 apps/web/dist/$f" >&2
    exit 1
  fi
done

# 内容寻址指纹：写入文件与 Job Summary，用于确认 preview / production 用的是同一份字节
python3 - <<'PY'
import hashlib
import pathlib

dist = pathlib.Path('apps/web/dist')
h = hashlib.sha256()
files = sorted(p for p in dist.rglob('*') if p.is_file())
for p in files:
    h.update(str(p.relative_to(dist)).encode())
    h.update(p.read_bytes())
digest = h.hexdigest()
pathlib.Path('dist-sha256.txt').write_text(digest + '\n')
print(f'dist-sha256={digest}  files={len(files)}')
PY

echo "commit=$(git rev-parse HEAD)"
