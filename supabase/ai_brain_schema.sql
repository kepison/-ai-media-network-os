-- AI Brain schema
-- Defines tables for AI execution tracking, prompt management, and decision tracing.

-- =====================================================================
-- ai_runs table
-- Stores main information about each AI execution
-- =====================================================================
create table if not exists ai_runs (
  id              bigserial primary key,
  user_request    text not null,
  final_result    text,
  status          text not null default 'queued' check (status in ('queued', 'planning', 'searching', 'reading', 'analyzing', 'generating', 'verifying', 'completed', 'failed', 'fallback')),
  start_time      timestamptz not null default now(),
  end_time        timestamptz,
  duration        interval,
  total_tokens    int default 0,
  total_cost      numeric(10, 4) default 0.0000,
  main_agent_id   text, -- e.g., 'director'
  model_name      text,
  provider_name   text,
  backend_info    text, -- e.g., 'Vulkan'
  device_info     text, -- e.g., 'RX 580'
  initial_prompt_version_id bigint,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- ai_run_steps table
-- Details each step within an AI run
-- =====================================================================
create table if not exists ai_run_steps (
  id              bigserial primary key,
  run_id          bigint not null references ai_runs(id) on delete cascade,
  parent_step_id  bigint references ai_run_steps(id) on delete cascade, -- For nested steps
  agent_name      text not null,
  step_type       text not null, -- e.g., 'planning', 'data_loading', 'analysis', 'generation'
  status          text not null default 'queued' check (status in ('queued', 'in_progress', 'completed', 'failed', 'fallback')),
  start_time      timestamptz not null default now(),
  end_time        timestamptz,
  duration        interval,
  input_summary   text,
  output_summary  text,
  source_count    int default 0,
  model_name      text,
  provider_name   text,
  tokens_used     int default 0,
  cost_incurred   numeric(10, 4) default 0.0000,
  error_message   text,
  confidence      text, -- e.g., 'HIGH', 'MEDIUM', 'LOW'
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- ai_run_sources table
-- Tracks data sources used in a run
-- =====================================================================
create table if not exists ai_run_sources (
  id              bigserial primary key,
  run_id          bigint not null references ai_runs(id) on delete cascade,
  step_id         bigint references ai_run_steps(id) on delete cascade,
  source_type     text not null, -- e.g., 'VIDEO', 'CSV', 'WEB', 'USER_INPUT', 'AI_GENERATED'
  title           text,
  url             text,
  retrieved_at    timestamptz not null default now(),
  content_snippet text,
  full_content_hash text, -- To store a hash of the full content if needed for de-duplication
  confidence      text,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- ai_claims table
-- Stores AI-generated claims
-- =====================================================================
create table if not exists ai_claims (
  id              bigserial primary key,
  run_id          bigint not null references ai_runs(id) on delete cascade,
  step_id         bigint not null references ai_run_steps(id) on delete cascade,
  claim_text      text not null,
  claim_type      text,
  agent_name      text,
  sample_size     int,
  confidence      text,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- ai_evidence table
-- Links claims to their supporting evidence (sources or other claims)
-- =====================================================================
create table if not exists ai_evidence (
  id              bigserial primary key,
  claim_id        bigint not null references ai_claims(id) on delete cascade,
  source_id       bigint references ai_run_sources(id) on delete cascade, -- Link to a direct source
  supporting_claim_id bigint references ai_claims(id) on delete cascade, -- Link to another claim
  context_snippet text,
  confidence      text,
  created_at      timestamptz not null default now(),
  CONSTRAINT chk_evidence_type CHECK ((source_id IS NOT NULL AND supporting_claim_id IS NULL) OR (source_id IS NULL AND supporting_claim_id IS NOT NULL))
);


-- =====================================================================
-- ai_decisions table
-- Records decisions made by AI agents
-- =====================================================================
create table if not exists ai_decisions (
  id              bigserial primary key,
  run_id          bigint not null references ai_runs(id) on delete cascade,
  step_id         bigint not null references ai_run_steps(id) on delete cascade,
  agent_name      text not null,
  decision_text   text not null,
  observation     text,
  interpretation  text,
  action_taken    text,
  confidence      text,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- prompt_versions table
-- Manages different versions of prompts
-- =====================================================================
create table if not exists prompt_versions (
  id              bigserial primary key,
  agent_name      text not null,
  version_number  int not null,
  content         text not null,
  system_prompt   text,
  developer_prompt text,
  task_prompt     text,
  context_template text,
  model_parameters jsonb, -- Store model parameters as JSONB
  change_summary  text,
  created_by      text, -- e.g., 'user', 'ai_system'
  created_at      timestamptz not null default now(),
  parent_version_id bigint references prompt_versions(id) on delete set null,
  performance_metrics jsonb, -- Store performance metrics as JSONB
  success_rate    numeric(5, 2), -- Percentage
  CONSTRAINT unique_agent_version UNIQUE (agent_name, version_number)
);

-- =====================================================================
-- agent_configs table
-- Stores configurations for each agent
-- =====================================================================
create table if not exists agent_configs (
  id              bigserial primary key,
  agent_name      text not null unique,
  purpose         text,
  active_prompt_version_id bigint references prompt_versions(id) on delete set null,
  default_model   text,
  default_provider text,
  rules_config    jsonb,
  decision_framework jsonb,
  sub_agents_config jsonb,
  tools_config    jsonb,
  available_data_config jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- ai_costs table
-- Logs usage and cost over time
-- =====================================================================
create table if not exists ai_costs (
  id              bigserial primary key,
  run_id          bigint references ai_runs(id) on delete cascade,
  model_name      text,
  provider_name   text,
  tokens_used     int,
  cost_incurred   numeric(10, 4),
  latency_ms      int,
  request_count   int default 1,
  created_at      timestamptz not null default now()
);

-- Indexes for performance
create index if not exists ai_runs_status_idx on ai_runs(status);
create index if not exists ai_run_steps_run_id_idx on ai_run_steps(run_id);
create index if not exists ai_run_steps_agent_name_idx on ai_run_steps(agent_name);
create index if not exists ai_run_sources_run_id_idx on ai_run_sources(run_id);
create index if not exists ai_claims_run_id_idx on ai_claims(run_id);
create index if not exists ai_evidence_claim_id_idx on ai_evidence(claim_id);
create index if not exists ai_decisions_run_id_idx on ai_decisions(run_id);
create index if not exists prompt_versions_agent_name_idx on prompt_versions(agent_name);
create index if not exists ai_costs_created_at_idx on ai_costs(created_at);
