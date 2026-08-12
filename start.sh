#!/usr/bin/env bash
# AI Media Network OS — запуск одним командой
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$ROOT/scripts/amos.sh" start "$@"

# Показать режим инференса (GPU via Vulkan / CPU fallback)
if [ -f "$ROOT/scripts/gpu-health.sh" ] && command -v ollama >/dev/null 2>&1; then
  source "$ROOT/scripts/gpu-health.sh" 2>/dev/null
  case "$GPU_STATUS" in
    GPU)
      echo -e "  \033[1;32m[INFERENCE] GPU active (Vulkan backend): $GPU_MODEL — $GPU_PROC\033[0m"
      ;;
    CPU)
      echo -e "  \033[1;33m[INFERENCE] CPU fallback active: $GPU_MODEL — $GPU_PROC\033[0m (GPU недоступен)"
      ;;
    OFFLINE)
      echo -e "  \033[1;33m[INFERENCE] Ollama не запущен (отвечает только UI)\033[0m"
      ;;
  esac
fi