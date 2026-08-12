#!/usr/bin/env bash
# AI Media Network OS — установка (CachyOS/Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { echo -e "\033[1;36m[INSTALL]\033[0m $*"; }
err() { echo -e "\033[1;31m[ERR]\033[0m $*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { err "не найдено: $1. Установите: sudo pacman -S $2"; MISSING=1; }
}

MISSING=0
need node nodejs
need npm npm
need git git
need curl curl

if [ "$MISSING" = "1" ]; then exit 1; fi

log "Node: $(node -v), npm: $(npm -v)"

# .env
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  log "создан .env из примера"
fi

log "установка зависимостей backend + frontend"
cd "$ROOT"
npm install 2>&1 | tail -3 || true

# approve install scripts for native builds (npm 12+)
npm install-scripts approve better-sqlite3 esbuild >/dev/null 2>&1 || true

cd "$ROOT/backend"
npm install 2>&1 | tail -2 || true

log "проверка базы данных"
if [ ! -f "$ROOT/data/ai-media-os.db" ]; then
  log "базы нет — создание и демо-данные"
  npx tsx src/db/seed.ts
else
  log "база существует"
fi

log "проверка Ollama (локальные модели)"
if command -v ollama >/dev/null 2>&1; then
  if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    log "ollama не запущен — запускаю и проверяю модель"
    ollama serve >/dev/null 2>&1 & sleep 3
  fi
  HAVEMODEL=$(ollama list 2>/dev/null | grep -c "qwen2.5:7b" || true)
  if [ "$HAVEMODEL" = "0" ]; then
    log "скачивание qwen2.5:7b (~4.7GB) — это бесплатная локальная модель"
    ollama pull qwen2.5:7b
  else
    log "модель qwen2.5:7b уже установлена"
  fi
else
  err "ollama не установлен. Локальные модели недоступны (работают только облачные через .env)"
fi

log "сборка frontend"
cd "$ROOT"
npm run build -w frontend 2>&1 | tail -2

log "установка завершена. Запуск: ./start.sh"