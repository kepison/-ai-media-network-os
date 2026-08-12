import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch('now'))`;

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  created_at: integer("created_at").notNull().default(now),
  updated_at: integer("updated_at").notNull().default(now),
});

export const networks = sqliteTable(
  "networks",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    created_at: integer("created_at").notNull().default(now),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [index("idx_network_workspace").on(t.workspace_id)]
);

export const platforms = sqliteTable("platforms", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // youtube, tiktok, instagram, telegram
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const niches = sqliteTable(
  "niches",
  {
    id: text("id").primaryKey(),
    network_id: text("network_id").references(() => networks.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    languages: text("languages", { mode: "json" }).$type<string[]>(),
    geos: text("geos", { mode: "json" }).$type<string[]>(),
    taxonomy: text("taxonomy", { mode: "json" }).$type<string[]>(),
    content_formats: text("content_formats", { mode: "json" }).$type<
      Record<string, unknown>[]
    >(),
    research_sources: text("research_sources", { mode: "json" }).$type<
      Record<string, unknown>[]
    >(),
    audience_profile: text("audience_profile", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    monetization_categories: text("monetization_categories", {
      mode: "json",
    }).$type<string[]>(),
    is_demo: integer("is_demo", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull().default(now),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [index("idx_niche_network").on(t.network_id)]
);

export const brands = sqliteTable(
  "brands",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    language: text("language"),
    geo: text("geo"),
    description: text("description"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_brand_niche").on(t.niche_id)]
);

export const audiences = sqliteTable(
  "audiences",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    brand_id: text("brand_id").references(() => brands.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    profile: text("profile", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_audience_niche").on(t.niche_id)]
);

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    brand_id: text("brand_id").references(() => brands.id, {
      onDelete: "cascade",
    }),
    platform_id: text("platform_id").references(() => platforms.id),
    name: text("name").notNull(),
    handle: text("handle"),
    url: text("url"),
    status: text("status").notNull().default("active"),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_channel_brand").on(t.brand_id)]
);

export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    channel_id: text("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    brand_id: text("brand_id").references(() => brands.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    topic: text("topic"),
    hook: text("hook"),
    format: text("format"),
    language: text("language"),
    geo: text("geo"),
    status: text("status").notNull().default("published"),
    url: text("url"),
    external_id: text("external_id"),
    duration_seconds: integer("duration_seconds"),
    published_at: text("published_at"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    source: text("source"), // import source / manual / demo
    is_demo: integer("is_demo", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull().default(now),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("idx_video_channel").on(t.channel_id),
    index("idx_video_niche").on(t.niche_id),
  ]
);

// RAW analytics — никогда не изменяются AI
export const metrics = sqliteTable(
  "metrics",
  {
    id: text("id").primaryKey(),
    video_id: text("video_id").references(() => videos.id, {
      onDelete: "cascade",
    }),
    date: text("date").notNull(),
    views: integer("views").default(0),
    likes: integer("likes").default(0),
    comments: integer("comments").default(0),
    shares: integer("shares").default(0),
    saves: integer("saves").default(0),
    followers_gained: integer("followers_gained").default(0),
    avg_watch_time_sec: real("avg_watch_time_sec"),
    avg_percentage_viewed: real("avg_percentage_viewed"),
    retention_0_3: real("retention_0_3"), // % watched 0-3s
    retention_10: real("retention_10"),
    retention_30: real("retention_30"),
    retention_60: real("retention_60"),
    ctr: real("ctr"),
    traffic_source: text("traffic_source", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    returning_viewers: integer("returning_viewers"),
    watch_time_hours: real("watch_time_hours"),
    rpm: real("rpm"),
    revenue: real("revenue"),
    clicks: integer("clicks"),
    conversions: integer("conversions"),
    source: text("source"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_metric_video").on(t.video_id),
    index("idx_metric_date").on(t.date),
  ]
);

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category"),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_topic_niche").on(t.niche_id)]
);

export const hooks = sqliteTable(
  "hooks",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    video_id: text("video_id").references(() => videos.id, {
      onDelete: "cascade",
    }),
    text: text("text").notNull(),
    type: text("type"), // contradiction, shock, question, mystery, money, conflict...
    performance: text("performance", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    source: text("source"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_hook_niche").on(t.niche_id)]
);

export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    brand_id: text("brand_id").references(() => brands.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    topic: text("topic"),
    description: text("description"),
    hooks: text("hooks", { mode: "json" }).$type<string[]>(),
    viral_score: integer("viral_score"),
    score_breakdown: text("score_breakdown", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    evidence: text("evidence", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").notNull().default("new"),
    language: text("language"),
    source: text("source"),
    is_demo: integer("is_demo", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull().default(now),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [index("idx_idea_niche").on(t.niche_id)]
);

export const scripts = sqliteTable(
  "scripts",
  {
    id: text("id").primaryKey(),
    idea_id: text("idea_id").references(() => ideas.id, {
      onDelete: "cascade",
    }),
    niche_id: text("niche_id").references(() => niches.id),
    title: text("title").notNull(),
    hook: text("hook"),
    body: text("body", { mode: "json" }).$type<Record<string, unknown>>(),
    retention_map: text("retention_map", { mode: "json" }).$type<
      Record<string, unknown>[]
    >(),
    viral_score: integer("viral_score"),
    status: text("status").notNull().default("draft"),
    language: text("language"),
    production_time_min: integer("production_time_min"),
    copyright_risk: text("copyright_risk"),
    created_at: integer("created_at").notNull().default(now),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [index("idx_script_idea").on(t.idea_id)]
);

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    channel_id: text("channel_id").references(() => channels.id),
    name: text("name").notNull(),
    hypothesis: text("hypothesis").notNull(),
    change: text("change").notNull(),
    sample_size: integer("sample_size"),
    expected_result: text("expected_result"),
    success_metric: text("success_metric"),
    status: text("status").notNull().default("active"), // active, completed, killed
    decision: text("decision"), // KEEP, KILL, SCALE, MORE_DATA
    result_notes: text("result_notes"),
    start_date: text("start_date"),
    end_date: text("end_date"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_exp_niche").on(t.niche_id)]
);

export const research = sqliteTable(
  "research",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    url: text("url"),
    source_type: text("source_type"), // web, user, ai_inference
    source: text("source"),
    content: text("content"),
    confidence: text("confidence"),
    retrieved_at: text("retrieved_at"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_research_niche").on(t.niche_id)]
);

export const monetization_opportunities = sqliteTable(
  "monetization_opportunities",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id, {
      onDelete: "cascade",
    }),
    brand_id: text("brand_id").references(() => brands.id),
    company: text("company").notNull(),
    website: text("website"),
    product: text("product"),
    geo: text("geo"),
    audience_fit: text("audience_fit"),
    format: text("format"),
    program_type: text("program_type"), // affiliate, cpa, cpl, sponsor, ads, own_product, donation, subscription
    commission: text("commission"),
    requirements: text("requirements"),
    contact: text("contact"),
    official_source: text("official_source"),
    risk: text("risk"),
    verification_status: text("verification_status").notNull().default("UNVERIFIED"),
    notes: text("notes"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_mon_niche").on(t.niche_id)]
);

export const revenue = sqliteTable(
  "revenue",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id),
    channel_id: text("channel_id").references(() => channels.id),
    source_type: text("source_type").notNull(), // ads, affiliate, cpa, sponsor, product...
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    date: text("date").notNull(),
    note: text("note"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_revenue_niche").on(t.niche_id)]
);

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  role: text("role"),
  description: text("description"),
  model_config: text("model_config", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  system_prompt: text("system_prompt"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  created_at: integer("created_at").notNull().default(now),
});

export const agent_runs = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    agent_key: text("agent_key").notNull(),
    task: text("task"),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    sources: text("sources", { mode: "json" }).$type<Record<string, unknown>[]>(),
    model: text("model"),
    provider: text("provider"),
    tokens_in: integer("tokens_in"),
    tokens_out: integer("tokens_out"),
    latency_ms: integer("latency_ms"),
    cost: real("cost"),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    confidence: text("confidence"),
    status: text("status").notNull().default("pending"), // pending, running, done, error
    error: text("error"),
    niche_id: text("niche_id").references(() => niches.id),
    run_id: text("run_id"), // link to parent ai_runs.id
    step_id: text("step_id"), // link to parent ai_run_steps.id
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_run_agent").on(t.agent_key)]
);

export const grids = sqliteTable("grids", {
  id: text("id").primaryKey(),
  niche_id: text("niche_id").references(() => niches.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  type: text("type").notNull(), // content, ideas, scripts, competitors, experiments, monetization, research
  columns: text("columns", { mode: "json" }).$type<
    { key: string; label: string }[]
  >(),
  created_at: integer("created_at").notNull().default(now),
});

export const grid_views = sqliteTable(
  "grid_views",
  {
    id: text("id").primaryKey(),
    grid_id: text("grid_id").references(() => grids.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>(),
    sorting: text("sorting", { mode: "json" }).$type<Record<string, unknown>>(),
    column_visibility: text("column_visibility", { mode: "json" }).$type<
      string[]
    >(),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_view_grid").on(t.grid_id)]
);

export const model_providers = sqliteTable("model_providers", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // ollama, openrouter
  name: text("name").notNull(),
  kind: text("kind").notNull().default("remote"), // local, remote
  base_url: text("base_url"),
  env_key: text("env_key"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  created_at: integer("created_at").notNull().default(now),
});

export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    provider_id: text("provider_id").references(() => model_providers.id, {
      onDelete: "cascade",
    }),
    model_id: text("model_id").notNull(),
    name: text("name").notNull(),
    context_size: integer("context_size"),
    cost_in: real("cost_in"),
    cost_out: real("cost_out"),
    reasoning: integer("reasoning", { mode: "boolean" }).default(false),
    capability: text("capability"), // strong_reasoning, analytical, creative, research, fast, cheap
    availability: text("availability"), // free, paid, local
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    priority: integer("priority").default(100),
    cooldown_until: integer("cooldown_until"),
    last_used_at: integer("last_used_at"),
    notes: text("notes"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_model_provider").on(t.provider_id)]
);

export const analyses = sqliteTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id),
    type: text("type").notNull(), // analyst, director, scriptwriter, monetization
    scope: text("scope", { mode: "json" }).$type<Record<string, unknown>>(),
    findings: text("findings", { mode: "json" }).$type<Record<string, unknown>[]>(),
    evidence: text("evidence", { mode: "json" }).$type<Record<string, unknown>>(),
    model: text("model"),
    provider: text("provider"),
    confidence: text("confidence"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_analysis_niche").on(t.niche_id)]
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id),
    analysis_id: text("analysis_id").references(() => analyses.id, {
      onDelete: "set null",
    }),
    decision: text("decision").notNull(), // KILL, KEEP, TEST, SCALE, DOUBLE_DOWN, CLONE, OUTSOURCE, AUTOMATE
    target: text("target"), // topic, hook, format, channel...
    evidence: text("evidence", { mode: "json" }).$type<Record<string, unknown>>(),
    confidence: text("confidence"),
    reason: text("reason"),
    next_action: text("next_action"),
    status: text("status").notNull().default("open"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_decision_niche").on(t.niche_id)]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    niche_id: text("niche_id").references(() => niches.id),
    channel_id: text("channel_id").references(() => channels.id),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").default("medium"),
    status: text("status").notNull().default("open"),
    assignee: text("assignee"),
    decision_id: text("decision_id").references(() => decisions.id, {
      onDelete: "set null",
    }),
    created_at: integer("created_at").notNull().default(now),
    completed_at: text("completed_at"),
  },
  (t) => [index("idx_task_niche").on(t.niche_id)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updated_at: integer("updated_at").notNull().default(now),
});

export type Workspace = typeof workspaces.$inferSelect;
export type Network = typeof networks.$inferSelect;
export type Niche = typeof niches.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;

// =====================================================================
// AI Brain
// =====================================================================

export const ai_runs = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    user_request: text("user_request").notNull(),
    final_result: text("final_result"),
    status: text("status").notNull().default("queued"), // queued planning searching reading analyzing generating verifying completed failed fallback
    start_time: integer("start_time").notNull().default(now),
    end_time: integer("end_time"),
    duration_ms: integer("duration_ms"),
    total_tokens: integer("total_tokens").default(0),
    total_cost: real("total_cost").default(0.0000),
    main_agent: text("main_agent"), // director | analyst | scriptwriter | monetization
    model: text("model"),
    provider: text("provider"),
    backend_info: text("backend_info"), // Vulkan / CPU / CUDA
    device_info: text("device_info"), // RX 580 2048SP
    niche_id: text("niche_id").references(() => niches.id),
    prompt_version_id: text("prompt_version_id"),
    source_count: integer("source_count").default(0),
    errors: text("errors"),
    queued_reason: text("queued_reason"),
    next_retry_at: integer("next_retry_at"),
    eligible_providers: text("eligible_providers", { mode: "json" }).$type<
      string[]
    >(),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_ai_runs_status").on(t.status),
    index("idx_ai_runs_main_agent").on(t.main_agent),
    index("idx_ai_runs_created").on(t.created_at),
  ]
);

export const ai_run_steps = sqliteTable(
  "ai_run_steps",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => ai_runs.id, { onDelete: "cascade" }),
    parent_step_id: text("parent_step_id"),
    agent: text("agent").notNull(), // director, analyst, scriptwriter, monetization
    step_type: text("step_type").notNull(), // planning data_loading searching reading analyzing generating verifying final
    label: text("label"),
    status: text("status").notNull().default("queued"), // queued in_progress completed failed fallback
    start_time: integer("start_time").notNull().default(now),
    end_time: integer("end_time"),
    duration_ms: integer("duration_ms"),
    input_summary: text("input_summary"),
    output_summary: text("output_summary"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    source_count: integer("source_count").default(0),
    model: text("model"),
    provider: text("provider"),
    backend_info: text("backend_info"),
    device_info: text("device_info"),
    tokens: integer("tokens").default(0),
    cost: real("cost").default(0),
    prompt_version_id: text("prompt_version_id"),
    confidence: text("confidence"),
    error: text("error"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_ai_run_steps_run_id").on(t.run_id),
    index("idx_ai_run_steps_agent").on(t.agent),
  ]
);

export const ai_run_sources = sqliteTable(
  "ai_run_sources",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => ai_runs.id, { onDelete: "cascade" }),
    step_id: text("step_id").references(() => ai_run_steps.id, {
      onDelete: "cascade",
    }),
    source_type: text("source_type").notNull(), // VIDEO CSV XLSX DATABASE WEB RESEARCH USER_INPUT AI_GENERATED SYSTEM AI_INFERENCE
    title: text("title"),
    url: text("url"),
    ref_id: text("ref_id"), // link to videos.id / research.id / etc
    column_name: text("column_name"),
    snippet: text("snippet"),
    sample_size: integer("sample_size"),
    median_value: real("median_value"),
    retrieved_at: text("retrieved_at"),
    confidence: text("confidence"),
    full_content_hash: text("full_content_hash"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_ai_run_sources_run_id").on(t.run_id),
    index("idx_ai_run_sources_step_id").on(t.step_id),
    index("idx_ai_run_sources_type").on(t.source_type),
  ]
);

export const ai_claims = sqliteTable(
  "ai_claims",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => ai_runs.id, { onDelete: "cascade" }),
    step_id: text("step_id").references(() => ai_run_steps.id, {
      onDelete: "cascade",
    }),
    agent: text("agent"),
    claim: text("claim").notNull(),
    claim_type: text("claim_type"), // finding, inference, recommendation
    sample_size: integer("sample_size"),
    confidence: text("confidence"), // HIGH MEDIUM LOW
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_ai_claims_run_id").on(t.run_id),
    index("idx_ai_claims_step_id").on(t.step_id),
  ]
);

export const ai_evidence = sqliteTable(
  "ai_evidence",
  {
    id: text("id").primaryKey(),
    claim_id: text("claim_id")
      .notNull()
      .references(() => ai_claims.id, { onDelete: "cascade" }),
    source_id: text("source_id").references(() => ai_run_sources.id, {
      onDelete: "cascade",
    }),
    supporting_claim_id: text("supporting_claim_id"),
    snippet: text("snippet"),
    confidence: text("confidence"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_ai_evidence_claim_id").on(t.claim_id)]
);

export const ai_decisions = sqliteTable(
  "ai_decisions",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => ai_runs.id, { onDelete: "cascade" }),
    step_id: text("step_id").references(() => ai_run_steps.id, {
      onDelete: "cascade",
    }),
    agent: text("agent").notNull(),
    decision: text("decision").notNull(), // KILL KEEP TEST SCALE DOUBLE_DOWN CLONE OUTSOURCE AUTOMATE
    target: text("target"),
    observation: text("observation"),
    evidence: text("evidence"),
    interpretation: text("interpretation"),
    action: text("action"),
    confidence: text("confidence"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_ai_decisions_run_id").on(t.run_id)]
);

export const prompt_versions = sqliteTable(
  "prompt_versions",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(), // director analyst scriptwriter monetization research fact_checker
    version: integer("version").notNull(),
    content: text("content").notNull(),
    system_prompt: text("system_prompt"),
    developer_prompt: text("developer_prompt"),
    task_prompt: text("task_prompt"),
    context_template: text("context_template"),
    model_parameters: text("model_parameters", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    change_summary: text("change_summary"),
    created_by: text("created_by").default("system"), // user | system | ai_proofreader | manual
    parent_version_id: text("parent_version_id"),
    performance_metrics: text("performance_metrics", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    success_rate: real("success_rate"),
    is_active: integer("is_active", { mode: "boolean" }).default(false),
    is_draft: integer("is_draft", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_prompt_versions_agent").on(t.agent),
    uniqueIndex("idx_prompt_versions_agent_version").on(t.agent, t.version),
  ]
);

export const ai_costs = sqliteTable(
  "ai_costs",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").references(() => ai_runs.id, { onDelete: "cascade" }),
    step_id: text("step_id"),
    provider: text("provider"),
    model: text("model"),
    tokens: integer("tokens").default(0),
    tokens_in: integer("tokens_in").default(0),
    tokens_out: integer("tokens_out").default(0),
    requests: integer("requests").default(1),
    latency_ms: integer("latency_ms"),
    cost: real("cost").default(0),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_ai_costs_run_id").on(t.run_id)]
);

export const agent_configs = sqliteTable(
  "agent_configs",
  {
    agent_key: text("agent_key").primaryKey(),
    purpose: text("purpose"),
    active_prompt_version_id: text("active_prompt_version_id"),
    default_model: text("default_model"),
    default_provider: text("default_provider"),
    rules_config: text("rules_config", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    decision_framework: text("decision_framework", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    sub_agents_config: text("sub_agents_config", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    tools_config: text("tools_config", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    available_data_config: text("available_data_config", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    memory: text("memory", { mode: "json" }).$type<Record<string, unknown>>(),
    updated_at: integer("updated_at").notNull().default(now),
  },
  (t) => [index("idx_agent_configs_key").on(t.agent_key)]
);

export const api_keys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // gemini | openrouter | custom
    label: text("label"),
    key_value: text("key_value").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    priority: integer("priority").default(0),
    cooldown_until: integer("cooldown_until"),
    last_error: text("last_error"),
    last_status: text("last_status"),
    rate_limit_count: integer("rate_limit_count").default(0),
    last_used_at: integer("last_used_at"),
    created_at: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("idx_api_keys_provider").on(t.provider),
  ]
);

export type AgentRun = typeof agent_runs.$inferSelect;
export type AiRun = typeof ai_runs.$inferSelect;
export type AiRunStep = typeof ai_run_steps.$inferSelect;
export type AiRunSource = typeof ai_run_sources.$inferSelect;
export type AiClaim = typeof ai_claims.$inferSelect;
export type AiEvidence = typeof ai_evidence.$inferSelect;
export type AiDecision = typeof ai_decisions.$inferSelect;
export type PromptVersion = typeof prompt_versions.$inferSelect;
export type AiCost = typeof ai_costs.$inferSelect;
export type AgentConfig = typeof agent_configs.$inferSelect;
