-- 0004_free_tier_queue
-- FREE-TIER QUEUE WITH AUTOMATIC COOLDOWN AND FAILOVER
-- Persistent rate-limit/cooldown state + model priority + queue bookkeeping.

ALTER TABLE api_keys ADD COLUMN cooldown_until INTEGER;
ALTER TABLE api_keys ADD COLUMN last_error TEXT;
ALTER TABLE api_keys ADD COLUMN last_status TEXT;
ALTER TABLE api_keys ADD COLUMN rate_limit_count INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN last_used_at INTEGER;

ALTER TABLE models ADD COLUMN priority INTEGER DEFAULT 100;
ALTER TABLE models ADD COLUMN cooldown_until INTEGER;
ALTER TABLE models ADD COLUMN last_used_at INTEGER;

ALTER TABLE ai_runs ADD COLUMN queued_reason TEXT;
ALTER TABLE ai_runs ADD COLUMN next_retry_at INTEGER;
ALTER TABLE ai_runs ADD COLUMN eligible_providers TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_runs_next_retry ON ai_runs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_cooldown ON api_keys(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_models_priority ON models(priority);

-- Backfill sensible free-tier priorities for seeded models (once).
UPDATE models SET priority = 1 WHERE model_id = 'qwen2.5:7b' AND priority = 100;
UPDATE models SET priority = 2 WHERE model_id = 'llama3.2:3b' AND priority = 100;
UPDATE models SET priority = 3 WHERE model_id IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite') AND priority = 100;
UPDATE models SET priority = 4 WHERE provider_id IN (SELECT id FROM model_providers WHERE key = 'openrouter') AND priority = 100;