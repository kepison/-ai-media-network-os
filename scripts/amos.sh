#!/usr/bin/env bash
# AI Media Network OS — операционные скрипты (CachyOS/Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
DATA_DIR="$ROOT/data"
PID_DIR="$DATA_DIR"
LOG_DIR="$DATA_DIR/logs"
PORT="${PORT:-4130}"
HOST="${HOST:-127.0.0.1}"

mkdir -p "$LOG_DIR"

BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

log() { echo -e "\033[1;36m[AMOS]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[1;31m[ERR]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[OK]\033[0m $*"; }

is_running() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pid() {
  if [ -f "$1" ]; then
    local pid
    pid="$(cat "$1")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$1"
  fi
}

stop_backend() { stop_pid "$BACKEND_PID"; }
stop_frontend() { stop_pid "$FRONTEND_PID"; }

start_backend() {
  cd "$BACKEND"
  nohup npx tsx src/index.ts >> "$LOG_DIR/backend.log" 2>&1 &
  echo "$!" > "$BACKEND_PID"
}

start_frontend_dev() {
  cd "$FRONTEND"
  nohup npx vite --host 127.0.0.1 --port 5173 >> "$LOG_DIR/frontend.log" 2>&1 &
  echo "$!" > "$FRONTEND_PID"
}

wait_http() {
  local url="$1" n=0
  while ! curl -sf "$url" >/dev/null 2>&1; do
    n=$((n+1))
    if [ "$n" -ge 60 ]; then return 1; fi
    sleep 0.5
  done
  return 0
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || { err "Требуется команда: $1"; exit 1; }; }

case "${1:-}" in
  start)
    need_cmd node
    need_cmd npm
    need_cmd npx
    if is_running "$BACKEND_PID"; then
      ok "backend уже запущен (pid $(cat "$BACKEND_PID"))"
    else
      log "запуск backend на http://$HOST:$PORT"
      start_backend
      if wait_http "http://$HOST:$PORT/api/health"; then ok "backend работает"; else err "backend не поднялся (см. $LOG_DIR/backend.log)"; exit 1; fi
    fi
    if [ "${DEV:-0}" = "1" ]; then
      if is_running "$FRONTEND_PID"; then
        ok "frontend dev уже запущен"
      else
        log "запуск frontend dev (5173)"
        start_frontend_dev
      fi
      log "открываю http://127.0.0.1:5173"
      (xdg-open "http://127.0.0.1:5173" >/dev/null 2>&1 &) || true
    else
      log "открываю http://$HOST:$PORT"
      (xdg-open "http://$HOST:$PORT" >/dev/null 2>&1 &) || true
    fi
    ;;
  stop)
    stop_frontend
    stop_backend
    ok "остановлено"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    local bk="STOPPED"
    local fr="STOPPED"
    is_running "$BACKEND_PID" && bk="RUNNING (pid $(cat "$BACKEND_PID"))"
    is_running "$FRONTEND_PID" && fr="RUNNING (pid $(cat "$FRONTEND_PID"))"
    echo "backend:  $bk"
    echo "frontend: $fr"
    echo "url:      http://$HOST:$PORT"
    ;;
  logs)
    tail -n 100 "$LOG_DIR/backend.log"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac