-- 0001_init
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE TABLE IF NOT EXISTS networks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_network_workspace ON networks(workspace_id);

CREATE TABLE IF NOT EXISTS platforms (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  config TEXT
);

CREATE TABLE IF NOT EXISTS niches (
  id TEXT PRIMARY KEY,
  network_id TEXT REFERENCES networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  languages TEXT,
  geos TEXT,
  taxonomy TEXT,
  content_formats TEXT,
  research_sources TEXT,
  audience_profile TEXT,
  monetization_categories TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_niche_network ON niches(network_id);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT,
  geo TEXT,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_brand_niche ON brands(niche_id);

CREATE TABLE IF NOT EXISTS audiences (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_audience_niche ON audiences(niche_id);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  platform_id TEXT REFERENCES platforms(id),
  name TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_channel_brand ON channels(brand_id);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  hook TEXT,
  format TEXT,
  language TEXT,
  geo TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  url TEXT,
  external_id TEXT,
  duration_seconds INTEGER,
  published_at TEXT,
  tags TEXT,
  source TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_video_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_video_niche ON videos(niche_id);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,
  avg_watch_time_sec REAL,
  avg_percentage_viewed REAL,
  retention_0_3 REAL,
  retention_10 REAL,
  retention_30 REAL,
  retention_60 REAL,
  ctr REAL,
  traffic_source TEXT,
  returning_viewers INTEGER,
  watch_time_hours REAL,
  rpm REAL,
  revenue REAL,
  clicks INTEGER,
  conversions INTEGER,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_metric_video ON metrics(video_id);
CREATE INDEX IF NOT EXISTS idx_metric_date ON metrics(date);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_topic_niche ON topics(niche_id);

CREATE TABLE IF NOT EXISTS hooks (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT,
  performance TEXT,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_hook_niche ON hooks(niche_id);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  description TEXT,
  hooks TEXT,
  viral_score INTEGER,
  score_breakdown TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  language TEXT,
  source TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_idea_niche ON ideas(niche_id);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  idea_id TEXT REFERENCES ideas(id) ON DELETE CASCADE,
  niche_id TEXT REFERENCES niches(id),
  title TEXT NOT NULL,
  hook TEXT,
  body TEXT,
  retention_map TEXT,
  viral_score INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  language TEXT,
  production_time_min INTEGER,
  copyright_risk TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_script_idea ON scripts(idea_id);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id),
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  change TEXT NOT NULL,
  sample_size INTEGER,
  expected_result TEXT,
  success_metric TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  decision TEXT,
  result_notes TEXT,
  start_date TEXT,
  end_date TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_exp_niche ON experiments(niche_id);

CREATE TABLE IF NOT EXISTS research (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  source_type TEXT,
  source TEXT,
  content TEXT,
  confidence TEXT,
  retrieved_at TEXT,
  tags TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_niche ON research(niche_id);

CREATE TABLE IF NOT EXISTS monetization_opportunities (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id),
  company TEXT NOT NULL,
  website TEXT,
  product TEXT,
  geo TEXT,
  audience_fit TEXT,
  format TEXT,
  program_type TEXT,
  commission TEXT,
  requirements TEXT,
  contact TEXT,
  official_source TEXT,
  risk TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_mon_niche ON monetization_opportunities(niche_id);

CREATE TABLE IF NOT EXISTS revenue (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id),
  channel_id TEXT REFERENCES channels(id),
  source_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  date TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_revenue_niche ON revenue(niche_id);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  model_config TEXT,
  system_prompt TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL,
  task TEXT,
  input TEXT,
  sources TEXT,
  model TEXT,
  provider TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  cost REAL,
  output TEXT,
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  niche_id TEXT REFERENCES niches(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_run_agent ON agent_runs(agent_key);

CREATE TABLE IF NOT EXISTS grids (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  columns TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TABLE IF NOT EXISTS grid_views (
  id TEXT PRIMARY KEY,
  grid_id TEXT REFERENCES grids(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters TEXT,
  sorting TEXT,
  column_visibility TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_view_grid ON grid_views(grid_id);

CREATE TABLE IF NOT EXISTS model_providers (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'remote',
  base_url TEXT,
  env_key TEXT,
  enabled INTEGER DEFAULT 1,
  config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES model_providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context_size INTEGER,
  cost_in REAL,
  cost_out REAL,
  reasoning INTEGER DEFAULT 0,
  capability TEXT,
  availability TEXT,
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_model_provider ON models(provider_id);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id),
  type TEXT NOT NULL,
  scope TEXT,
  findings TEXT,
  evidence TEXT,
  model TEXT,
  provider TEXT,
  confidence TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_analysis_niche ON analyses(niche_id);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id),
  analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL,
  decision TEXT NOT NULL,
  target TEXT,
  evidence TEXT,
  confidence TEXT,
  reason TEXT,
  next_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_decision_niche ON decisions(niche_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  niche_id TEXT REFERENCES niches(id),
  channel_id TEXT REFERENCES channels(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignee TEXT,
  decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_niche ON tasks(niche_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
);