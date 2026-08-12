#!/usr/bin/env bash
# AI Media Network OS — reset demo data
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$ROOT/scripts/amos.sh" stop
rm -f "$ROOT/data/ai-media-os.db" "$ROOT/data/ai-media-os.db-wal" "$ROOT/data/ai-media-os.db-shm"
cd "$ROOT/backend"
npx tsx src/db/seed.ts
"$ROOT/scripts/amos.sh" start
echo "Demo data reset complete."