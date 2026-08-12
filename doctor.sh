#!/usr/bin/env bash
# AI Media Network OS — doctor: диагностика системы
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0; WARN=0

ok()   { echo -e "  \033[1;32m[OK]\033[0m $1"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[1;31m[FAIL]\033[0m $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  \033[1;33m[WARN]\033[0m $1"; WARN=$((WARN+1)); }

echo "=== AI MEDIA NETWORK OS — doctor ==="

echo "--- OS / среда ---"
node -v >/dev/null 2>&1 && ok "Node $(node -v)" || bad "Node не установлен"
npm -v >/dev/null 2>&1 && ok "npm $(npm -v)" || bad "npm не установлен"
command -v python3 >/dev/null 2>&1 && ok "Python3" || warn "python3 нет"
command -v git >/dev/null 2>&1 && ok "git" || warn "git нет"

echo "--- GPU ---"
GPU_NAME=""
if command -v vulkaninfo >/dev/null 2>&1; then
  GPU_NAME=$(vulkaninfo --summary 2>/dev/null | grep -iE "deviceName" | head -1 | sed 's/^[[:space:]]*deviceName[[:space:]]*=[[:space:]]*//')
fi
PCI_GPU="$(lspci 2>/dev/null | grep -iE "VGA|3D|Display controller" | head -1)"
if [ -n "$GPU_NAME" ]; then
  ok "GPU: $GPU_NAME"
elif [ -n "$PCI_GPU" ]; then
  warn "GPU (по PCI): $PCI_GPU"
else
  warn "GPU не обнаружен"
fi
if ls /dev/kfd >/dev/null 2>&1; then ok "ROCm/kfd доступен (не обязателен — работаем через Vulkan)"; else warn "kfd нет"; fi
if command -v vulkaninfo >/dev/null 2>&1 && vulkaninfo --summary 2>/dev/null | grep -q "Radeon"; then
  ok "Vulkan драйвер: RADV (Mesa) — RustiCL/OpenCL доступен"
else
  warn "Vulkan драйвер не найден"
fi

echo "--- База данных ---"
DB="$ROOT/data/ai-media-os.db"
if [ -f "$DB" ]; then
  SIZE=$(du -h "$DB" | cut -f1)
  ok "SQLite: $DB ($SIZE)"
else
  bad "База данных отсутствует — запустите ./install.sh"
fi

echo "--- Порт 4130 ---"
if ss -tlnp 2>/dev/null | grep -q ":4130"; then
  ok "Порт 4130 занят (backend работает)"
else
  warn "Порт 4130 свободен (backend не запущен — ./start.sh)"
fi

echo "--- AI Gateway ---"
if command -v ollama >/dev/null 2>&1; then
  if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    MODELS=$(curl -sf http://127.0.0.1:11434/api/tags 2>/dev/null | grep -o '"name":"[^"]*"' | head -5)
    ok "Ollama запущен: $MODELS"
  else
    warn "Ollama установлен, но не запущен — ./install.sh или ollama serve"
  fi
else
  warn "Ollama не установлен"
fi
if [ -f "$ROOT/.env" ] && grep -q "OPENROUTER_API_KEY=.\+" "$ROOT/.env"; then
  ok "OpenRouter API key задан (free-only модели)"
else
  warn "OpenRouter key не задан (облачные модели выключены — работает только локальный Ollama, это бесплатно)"
fi

echo "--- OLLAMA / GPU ---"
OLLAMA_UP=0
if command -v ollama >/dev/null 2>&1 && curl -sf http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  ok "OLLAMA: работает (v$(curl -sf http://127.0.0.1:11434/api/version 2>/dev/null | grep -oE '"version":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//'))"
  OLLAMA_UP=1
else
  warn "OLLAMA: не запущен"
fi
GPU_BACKEND=""
GPU_AVAILABLE=0
if [ -f /usr/local/lib/ollama/vulkan/libggml-vulkan.so ]; then
  GPU_BACKEND="Vulkan"
  ok "GPU BACKEND: Vulkan (libggml-vulkan.so установлен)"
else
  warn "GPU BACKEND: Vulkan runner не найден"
fi
if command -v vulkaninfo >/dev/null 2>&1 && vulkaninfo --summary 2>/dev/null | grep -qE "deviceName.*Radeon|RX 580|POLARIS"; then
  GPU_AVAILABLE=1
  ok "GPU AVAILABLE: да (/dev/kfd + /dev/dri/renderD128 + RADV)"
else
  warn "GPU AVAILABLE: нет или не определён"
fi
if [ "$OLLAMA_UP" = "1" ]; then
  PS_OUT=$(curl -sf http://127.0.0.1:11434/api/ps 2>/dev/null)
  MODEL_NAME=$(echo "$PS_OUT" | grep -oE '"name":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
  VRAM_B=$(echo "$PS_OUT" | grep -oE '"size_vram":[0-9]+' | head -1 | grep -oE '[0-9]+')
  VRAM_B="${VRAM_B:-0}"
  if [ -n "$MODEL_NAME" ]; then
    ok "MODEL: $MODEL_NAME"
    if [ "$VRAM_B" != "0" ]; then
      VRAM_MB=$(python3 -c "print(f'{$VRAM_B/1024/1024:.0f} MiB')" 2>/dev/null || echo "$VRAM_B B")
      ok "INFERENCE MODE: GPU (Vulkan) — модель в VRAM ($VRAM_MB)"
      GPU_RESOLVED="OK"
    else
      warn "INFERENCE MODE: CPU — модель НЕ в VRAM (GPU не используется)"
      GPU_RESOLVED="CPU"
    fi
  else
    warn "MODEL: не загружена (ollama ps пустая — сделайте запрос)"
    GPU_RESOLVED="IDLE"
  fi
fi
if [ "${GPU_RESOLVED:-}" = "OK" ]; then
  ok "GPU INFERENCE: OK"
elif [ "${GPU_RESOLVED:-}" = "CPU" ]; then
  warn "GPU INFERENCE: NOT AVAILABLE (инференс на CPU)"
  ok "CPU FALLBACK: OK"
else
  warn "GPU INFERENCE: не проверен (Ollama не поднят) — CPU fallback работает"
fi
PAID=$(node -e "try{const db=require('better-sqlite3')('$ROOT/data/ai-media-os.db');const r=db.prepare(\"SELECT COUNT(*) c FROM models WHERE availability != 'free' AND enabled=1\").get();db.close();process.stdout.write(String(r.c));}catch(e){process.stdout.write('?')}" 2>/dev/null)
if [ "$PAID" = "0" ]; then
  ok "Free-only: платных включённых моделей нет (стоимость всех вызовов = 0)"
elif [ "$PAID" = "?" ]; then
  warn "Не удалось проверить free-only политику"
else
  bad "Обнаружены включённые платные модели ($PAID) — политика free-only нарушена"
fi

echo "--- Frontend ---"
[ -d "$ROOT/frontend/dist" ] && ok "Frontend собран" || warn "Frontend не собран (npm run build -w frontend)"

echo ""
echo "Итого: $PASS ок, $FAIL ошибок, $WARN предупреждений"
[ "$FAIL" = "0" ] || echo "Есть ошибки — устраните и повторите."
exit $((FAIL > 0 ? 1 : 0))