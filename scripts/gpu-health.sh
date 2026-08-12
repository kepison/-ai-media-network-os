#!/usr/bin/env bash
# GPU health detector — определяет доступность GPU-inference через Ollama (Vulkan backend)
# Возвращает:
#   $GPU_STATUS  = GPU | CPU | IDLE | OFFLINE
#   $GPU_BACKEND = Vulkan | none
#   $GPU_MODEL   = загруженная модель (если есть)
#   $GPU_VRAM_B  = размер модели в VRAM (bytes) если GPU
# Использование: source scripts/gpu-health.sh   (после этого читать переменные)
set -uo pipefail

GPU_STATUS="OFFLINE"
GPU_BACKEND="none"
GPU_MODEL=""
GPU_VRAM_B="0"
GPU_PROC=""

# Ollama жив?
if command -v ollama >/dev/null 2>&1 && curl -sf http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  GPU_STATUS="IDLE"
  # Vulkan backend установлен?
  if [ -f /usr/local/lib/ollama/vulkan/libggml-vulkan.so ]; then
    GPU_BACKEND="Vulkan"
  fi

  # Есть ли загруженная модель и в VRAM ли она?
  PS_OUT=$(curl -sf http://127.0.0.1:11434/api/ps 2>/dev/null || true)
  GPU_MODEL=$(echo "$PS_OUT" | grep -oE '"name":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
  GPU_VRAM_B=$(echo "$PS_OUT" | grep -oE '"size_vram":[0-9]+' | head -1 | grep -oE '[0-9]+')
  GPU_VRAM_B="${GPU_VRAM_B:-0}"
  if [ -n "$GPU_MODEL" ]; then
    if [ "$GPU_VRAM_B" != "0" ] && [ "$GPU_VRAM_B" != "" ]; then
      GPU_STATUS="GPU"
    else
      GPU_STATUS="CPU"
    fi
  fi
fi

export GPU_STATUS GPU_BACKEND GPU_MODEL GPU_VRAM_B GPU_PROC