# AI Media Network OS

Локальная AI-система для создания, анализа, управления и масштабирования сетки контентных каналов.

**Принцип:** это НЕ CS2-приложение. CS2 — первая ниша (demo). Система многонишевая:
`PLATFORM → NETWORK → NICHE → BRAND → CHANNEL → CONTENT → DATA → ANALYTICS → DECISIONS → PRODUCTION → MONETIZATION → SCALE`.

## Быстрый старт

```bash
./install.sh    # установка зависимостей, демо-данные, сборка
./start.sh      # запуск + открытие браузера http://127.0.0.1:4130
./stop.sh
./doctor.sh     # диагностика окружения/БД/AI gateway
./reset-demo.sh # пересоздать демо-данные
./update.sh
```

## Технологический стек

| Слой | Технология |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| База | SQLite + Drizzle ORM |
| Frontend | React 19 + Vite + Tailwind CSS |
| AI | Ollama (локально, бесплатно) + OpenRouter (облако) через собственный Model Router |

## AI Model Layer — БЕСПЛАТНО, никогда не платим

**Принцип free-only:** система автоматически никогда не выбирает платные модели.
Доступны только модели со стоимостью **$0 на 1K токенов** (cost_in=0, cost_out=0):

- **Ollama** — локальные модели (qwen2.5:7b, llama3.2:3b), работают через GPU/CPU без интернета и без лимитов
- **OpenRouter `:free`** — бесплатные облачные модели ($0), только если задан бесплатный `OPENROUTER_API_KEY`

Роутер `src/ai/gateway.ts` фильтрует кандидатов по `availability === "free"` ИЛИ локальности
(поля `availability`/`cost_in`/`cost_out` у модели). Платные модели отклоняются автоматически
на уровне кода — простой ручной выбор в UI тоже не сможет их использовать.
`doctor.sh` проверяет: `SELECT COUNT(*) FROM models WHERE availability != 'free' AND enabled=1` должен быть 0.

`OPENROUTER_API_KEY` — бесплатный ключ (регистрация на openrouter.ai, без карты),
даёт доступ к бесплатным моделям с дневными лимитами. Без ключа всё равно работает локальный Ollama — безлимитно и бесплатно.

## GPU inference (AMD, бесплатно, через Vulkan)

RX 580 (gfx803/Polaris) НЕ поддерживается ROCm 7.x (карта EOL), поэтому используется
**официальный Vulkan backend Ollama** — `libggml-vulkan.so` + RADV (Mesa). ROCm НЕ устанавливается
и не требуется. GPU активируется автоматически при запуске Ollama (прав групп `render`/`video` уже
достаточно).

- **Backend:** Vulkan (RADV POLARIS10), модель целиком в VRAM (`size_vram > 0` в `ollama ps`)
- **Скорость (qwen2.5:7b):** ~18 tok/s GPU vs ~5.4 tok/s CPU → ускорение ~3.4x
- **Fallback:** детектор `scripts/gpu-health.sh` + вывод в `doctor.sh`/`start.sh`;
  если GPU недоступен/ошибся — автоматически работает CPU, без платных моделей
- **Прочее:** `ollama ps` показывает `size_vram`=4.5 GiB при GPU-загрузке

Бенчмарк: `bash scripts/bench-ai.sh gpu` / `bash scripts/bench-ai.sh cpu`

## AI Model Layer

- **Ollama** — локальные бесплатные модели (qwen2.5:7b, llama3.2:3b), работают через GPU/CPU
- **OpenRouter** — облачные модели (заполните `OPENROUTER_API_KEY` в `.env`), включая бесплатные qwen2.5-72b
- Модели выбираются динамически по capability агента: `strong_reasoning` (Director), `analytical` (Analyst), `creative` (Scriptwriter)
- Ничто не зашито в код — провайдеры и модели хранятся в БД (таблицы `model_providers`, `models`)

## Архитектура данных

RAW DATA → ANALYSIS → DECISIONS → TASKS — раздельные таблицы. AI никогда не изменяет кинематику (metrics/views).

Сущности: workspace, network, niche, brand, channel, platform, video, metric, topic, hook, idea, script, experiment, research, monetization_opportunity, revenue, agent, agent_run, grid, model_provider, model, analysis, decision, task, setting.

### Создание новой ниши
```bash
POST http://127.0.0.1:4130/api/niche-templates
{
  "name": "MMA",
  "taxonomy": ["FIGHTERS","KO","DRAMA","MONEY"],
  "languages": ["ru","en"],
  "default_grids": [...]
}
```
Система создаст taxonomy, audience profile, research sources, default grids. CS2 при этом не ломается.

## Агенты

- **Director** — command center, приоритеты сети, команды KILL/KEEP/SCALE/TEST/DOUBLE DOWN
- **Analyst** — winners/losers, median vs average, evidence (claim/sample/confidence), корреляция ≠ причинность
- **Scriptwriter** — идеи от аналитики, VIRAL SCORE /100, 5+ hooks, retention map 0–60s
- **Monetization** — revenue ladder first $10→$500, UNVERIFIED-флаг, риск-скор

Многоагентная оркестрация: `POST /api/agents/orchestrate` — Director решает какие агенты нужны, запускает их, собирает финальный ответ.

## Тесты

```bash
cd backend && npx tsx test/run.ts   # 21 acceptance test (autostart серверa)
```

## Безопасность

- API-ключи только в `.env` (не в БД, не в логах, не в UI)
- `.env.example` и `.gitignore` в комплекте
- Frontend не получает master keys — ключи только в backend-слое

## Структура

```
ai-media-os/
├── backend/         Fastify API + агенты + AI gateway + seed
│   ├── src/
│   │   ├── ai/      model router + provider adapters
│   │   ├── agents/  director/analyst/scriptwriter/monetization
│   │   ├── api/     REST routes
│   │   ├── services/ analytics, import/export, niche templates
│   │   └── db/      schema (drizzle) + seed
│   ├── migrations/  SQL
│   └── test/
├── frontend/        React 19 SPA (Command Center)
├── scripts/         amos.sh (start/stop/status/logs)
├── data/            SQLite + logs
├── install.sh
├── start.sh
├── stop.sh
├── doctor.sh
├── update.sh
└── reset-demo.sh
```

## Продакшн-зависимости

- Для полноценной работы облачных агентов укажите `OPENROUTER_API_KEY` в `.env` и перезапустите.
- Для локального качества выберите модель помощнее в Ollama (например `ollama pull qwen2.5:14b`) при достаточной VRAM.