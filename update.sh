#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$ROOT/scripts/amos.sh" stop
cd "$ROOT"
git pull --ff-only 2>/dev/null || true
npm install >/dev/null 2>&1 || true
npm run build -w frontend >/dev/null 2>&1
"$ROOT/scripts/amos.sh" start
