-- 0002_ai_brain
-- Adds AI Brain tables and lineage columns to agent_runs.
-- Applied once via migration tracker.

ALTER TABLE agent_runs ADD COLUMN run_id TEXT;
ALTER TABLE agent_runs ADD COLUMN step_id TEXT;

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  user_request TEXT NOT NULL,
  final_result TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  start_time INTEGER NOT NULL DEFAULT (unixepoch('now')),
  end_time INTEGER,
  duration_ms INTEGER,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0000,
  main_agent TEXT,
  model TEXT,
  provider TEXT,
  backend_info TEXT,
  device_info TEXT,
  niche_id TEXT REFERENCES niches(id),
  prompt_version_id TEXT,
  source_count INTEGER DEFAULT 0,
  errors TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);
CREATE INDEX IF NOT EXISTS idx_ai_runs_main_agent ON ai_runs(main_agent);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created ON ai_runs(created_at);

CREATE TABLE IF NOT EXISTS ai_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  parent_step_id TEXT,
  agent TEXT NOT NULL,
  step_type TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  start_time INTEGER NOT NULL DEFAULT (unixepoch('now')),
  end_time INTEGER,
  duration_ms INTEGER,
  input_summary TEXT,
  output_summary TEXT,
  detail TEXT,
  source_count INTEGER DEFAULT 0,
  model TEXT,
  provider TEXT,
  backend_info TEXT,
  device_info TEXT,
  tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  prompt_version_id TEXT,
  confidence TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_run_steps_run_id ON ai_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_run_steps_agent ON ai_run_steps(agent);

CREATE TABLE IF NOT EXISTS ai_run_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES ai_run_steps(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  title TEXT,
  url TEXT,
  ref_id TEXT,
  column_name TEXT,
  snippet TEXT,
  sample_size INTEGER,
  median_value REAL,
  retrieved_at TEXT,
  confidence TEXT,
  full_content_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_run_sources_run_id ON ai_run_sources(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_run_sources_step_id ON ai_run_sources(step_id);
CREATE INDEX IF NOT EXISTS idx_ai_run_sources_type ON ai_run_sources(source_type);

CREATE TABLE IF NOT EXISTS ai_claims (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES ai_run_steps(id) ON DELETE CASCADE,
  agent TEXT,
  claim TEXT NOT NULL,
  claim_type TEXT,
  sample_size INTEGER,
  confidence TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_claims_run_id ON ai_claims(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_claims_step_id ON ai_claims(step_id);

CREATE TABLE IF NOT EXISTS ai_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES ai_claims(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES ai_run_sources(id) ON DELETE CASCADE,
  supporting_claim_id TEXT,
  snippet TEXT,
  confidence TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_claim_id ON ai_evidence(claim_id);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES ai_run_steps(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  decision TEXT NOT NULL,
  target TEXT,
  observation TEXT,
  evidence TEXT,
  interpretation TEXT,
  action TEXT,
  confidence TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_run_id ON ai_decisions(run_id);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  system_prompt TEXT,
  developer_prompt TEXT,
  task_prompt TEXT,
  context_template TEXT,
  model_parameters TEXT,
  change_summary TEXT,
  created_by TEXT DEFAULT 'system',
  parent_version_id TEXT,
  performance_metrics TEXT,
  success_rate REAL,
  is_active INTEGER DEFAULT 0,
  is_draft INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_agent ON prompt_versions(agent);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_agent_version ON prompt_versions(agent, version);

CREATE TABLE IF NOT EXISTS ai_costs (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES ai_runs(id) ON DELETE CASCADE,
  step_id TEXT,
  provider TEXT,
  model TEXT,
  tokens INTEGER DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  requests INTEGER DEFAULT 1,
  latency_ms INTEGER,
  cost REAL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_costs_run_id ON ai_costs(run_id);

CREATE TABLE IF NOT EXISTS agent_configs (
  agent_key TEXT PRIMARY KEY,
  purpose TEXT,
  active_prompt_version_id TEXT,
  default_model TEXT,
  default_provider TEXT,
  rules_config TEXT,
  decision_framework TEXT,
  sub_agents_config TEXT,
  tools_config TEXT,
  available_data_config TEXT,
  memory TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_configs_key ON agent_configs(agent_key);