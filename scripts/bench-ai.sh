#!/usr/bin/env bash
# CPU vs GPU Ollama benchmark — 4 промпта, метрики tokens/sec / latency / VRAM / RAM
# Использование:
#   bench-ai.sh gpu   (текущий работающий инстанс — GPU, Vulkan)
#   bench-ai.sh cpu   (инстанс на OLLAMA_PORT с GGML_VK_VISIBLE_DEVICES=-1)
set -uo pipefail

MODE="${1:-gpu}"
PORT="${2:-11434}"
BASE="http://127.0.0.1:${PORT}"
MODEL="${3:-qwen2.5:7b}"
WORK="$(mktemp -d)"
BODY="$WORK/body.json"

probe() {
  local label="$1" prompt="$2" ntok="$3"
  python3 - "$BODY" "$prompt" "$MODEL" "$ntok" <<'PY'
import json,sys
body={"model":sys.argv[3],"prompt":sys.argv[2],"stream":False,"options":{"num_predict":int(sys.argv[4])}}
json.dump(body,open(sys.argv[1],"w"))
PY
  local out="$WORK/out.json"
  local t0=$(date +%s%N)
  curl -s -m 600 "$BASE/api/generate" -d @"$BODY" -H "Content-Type: application/json" > "$out"
  local t1=$(date +%s%N)
  if ! grep -q '"done":true' "$out"; then
    echo "  $label: FAIL -> $(head -c 160 "$out")"
    return 1
  fi
  python3 - "$out" "$label" "$t0" "$t1" <<'PY'
import json,sys,time
d=json.load(open(sys.argv[1]))
label=sys.argv[2]
t0=int(sys.argv[3]); t1=int(sys.argv[4])
n=d.get('eval_count',0); ms=d.get('eval_duration',0)/1e6
wall=(t1-t0)/1e6
toks=n/(ms/1000) if ms>0 else 0
print(f"  {label:14s} tokens={n:5d} eval={ms:9.0f}ms  wall={wall:8.0f}ms  {toks:7.1f} tok/s  model={d.get('model')}")
PY
}

vram() {
  local t=$(cat /sys/class/drm/card1/device/mem_info/vram_total 2>/dev/null || echo 0)
  local u=$(cat /sys/class/drm/card1/device/mem_info/vram_used 2>/dev/null || echo 0)
  if [ "$u" != "0" ]; then
    python3 -c "print(f'  VRAM used: {int($u)/1024/1024:.1f} MiB / {int($t)/1024/1024/1024:.1f} GiB')"
  else
    echo "  VRAM: n/a (нет доступа) "
  fi
}

echo "=== BENCHMARK: $MODE (port $PORT, model $MODEL) ==="
vram
free -m | awk '/^Mem:/{printf "  RAM before: %.1f GiB used / %.1f GiB total\n", $3/1024, $2/1024}'

GENERAL='Ты ассистент. Кратко ответь: что важнее для удержания подписчиков YouTube-канала - регулярность выпусков или качество контента?'
ANALYST='Ты аналитик контента. По метрикам: тема drama (7 шт, avg 96459), тема ko (5 шт, avg 33410), тема review (6 шт, avg 22140), медиана 29108, победители выше медианы. Какие 3 темы МАСШТАБИРОВАТЬ, какие УДЕРЖАТЬ, какие БРОСИТЬ? Ответь структурой: вывод, статистика, рекомендации.'
DIRECTOR='Ты директор медиасети. Задана ниша CS2, 100 видео, победители drama, проигравшие review. Определи top-3 приоритета следующего цикла продакшена и лучший следующий шаг. Ответь JSON: top_priorities, next_best_action.'
SCRIPTWRITER='Ты сценарист. Дай 3 идеи видео для ниши CS2 (победившая тема drama), формат shorts, hook в первые 3 секунды, retention plan 0-60 секунд. Каждая идея: title, hook, структура.'

echo "--- простой general prompt ---"
probe "general" "$GENERAL" 200
echo "--- Analyst prompt ---"
probe "analyst" "$ANALYST" 300
echo "--- Director prompt ---"
probe "director" "$DIRECTOR" 300
echo "--- Scriptwriter prompt ---"
probe "scriptwriter" "$SCRIPTWRITER" 300

echo "--- итог по $MODE ---"
vram
free -m | awk '/^Mem:/{printf "  RAM after: %.1f GiB used / %.1f GiB total\n", $3/1024, $2/1024}'
rm -rf "$WORK"
echo "=== DONE $MODE ==="