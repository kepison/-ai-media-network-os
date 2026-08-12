import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { broadcast } from "./events.js";

const id = (p: string) => `${p}_${nanoid(12)}`;

export type NewRunInput = {
  user_request: string;
  main_agent?: string;
  niche_id?: string;
  model?: string;
  provider?: string;
  prompt_version_id?: string;
};

export type NewStepInput = {
  run_id: string;
  agent?: string;
  step_type?: string;
  label?: string;
  parent_step_id?: string;
  model?: string;
  provider?: string;
  backend_info?: string;
  device_info?: string;
  prompt_version_id?: string;
  input_summary?: string;
};

export function createRun(input: NewRunInput) {
  const run_id = "run_" + nanoid(12);
  db.insert(s.ai_runs)
    .values({
      id: run_id,
      user_request: input.user_request,
      main_agent: input.main_agent,
      niche_id: input.niche_id,
      model: input.model,
      provider: input.provider,
      prompt_version_id: input.prompt_version_id,
      status: "queued",
    })
    .run();
  broadcast({
    type: "run",
    run_id,
    status: "queued",
    main_agent: input.main_agent,
    user_request: input.user_request,
  });
  return run_id;
}

export function updateRun(run_id: string, patch: Partial<typeof s.ai_runs.$inferInsert>) {
  const before = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, run_id)).all()[0];
  db.update(s.ai_runs)
    .set(patch)
    .where(eq(s.ai_runs.id, run_id))
    .run();
  const after = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, run_id)).all()[0];
  broadcast({
    type: "run",
    run_id,
    status: after?.status,
    main_agent: after?.main_agent,
    model: after?.model,
    provider: after?.provider,
    total_tokens: after?.total_tokens,
    total_cost: after?.total_cost,
    source_count: after?.source_count,
    duration_ms: after?.duration_ms,
    prev_status: before?.status,
  });
  return after;
}

export function failRun(run_id: string, error: string, fallback?: string) {
  const now = Math.floor(Date.now() / 1000);
  const started = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, run_id)).all()[0];
  updateRun(run_id, {
    status: fallback ? "fallback" : "failed",
    errors: error,
    end_time: now,
    duration_ms: started?.start_time ? (now - started.start_time) * 1000 : undefined,
  });
}

export function completeRun(run_id: string, final_result?: string, patch: Partial<typeof s.ai_runs.$inferInsert> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const started = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, run_id)).all()[0];
  updateRun(run_id, {
    status: "completed",
    final_result,
    end_time: now,
    duration_ms: started?.start_time ? (now - started.start_time) * 1000 : undefined,
    ...patch,
  });
}

export function createStep(input: NewStepInput) {
  const step_id = "stp_" + nanoid(12);
  db.insert(s.ai_run_steps)
    .values({
      id: step_id,
      run_id: input.run_id,
      agent: input.agent ?? "director",
      step_type: input.step_type ?? "planning",
      label: input.label,
      parent_step_id: input.parent_step_id,
      model: input.model,
      provider: input.provider,
      backend_info: input.backend_info,
      device_info: input.device_info,
      prompt_version_id: input.prompt_version_id,
      input_summary: input.input_summary,
      status: "in_progress",
    })
    .run();
  broadcast({
    type: "step",
    run_id: input.run_id,
    step_id,
    status: "in_progress",
    agent: input.agent,
    step_type: input.step_type,
    label: input.label,
    model: input.model,
    provider: input.provider,
    backend_info: input.backend_info,
    device_info: input.device_info,
  });
  return step_id;
}

export function updateStep(
  step_id: string,
  patch: {
    status?: string;
    output_summary?: string;
    detail?: Record<string, unknown>;
    source_count?: number;
    tokens?: number;
    cost?: number;
    confidence?: string;
    error?: string;
    model?: string;
    provider?: string;
    backend_info?: string;
    device_info?: string;
    prompt_version_id?: string;
  }
) {
  const before = db.select().from(s.ai_run_steps).where(eq(s.ai_run_steps.id, step_id)).all()[0];
  const now = Math.floor(Date.now() / 1000);
  db.update(s.ai_run_steps)
    .set({
      status: patch.status,
      output_summary: patch.output_summary,
      detail: patch.detail,
      source_count: patch.source_count,
      tokens: patch.tokens,
      cost: patch.cost,
      confidence: patch.confidence,
      error: patch.error,
      model: patch.model,
      provider: patch.provider,
      backend_info: patch.backend_info,
      device_info: patch.device_info,
      prompt_version_id: patch.prompt_version_id,
      end_time: now,
      duration_ms: before?.start_time ? (now - before.start_time) * 1000 : undefined,
    })
    .where(eq(s.ai_run_steps.id, step_id))
    .run();
  broadcast({
    type: "step",
    run_id: before?.run_id,
    step_id,
    status: patch.status,
    agent: before?.agent,
    step_type: before?.step_type,
    label: before?.label,
    output_summary: patch.output_summary,
    source_count: patch.source_count,
    tokens: patch.tokens,
    cost: patch.cost,
    confidence: patch.confidence,
    error: patch.error,
    model: patch.model,
    provider: patch.provider,
    duration_ms: before?.start_time ? (now - before.start_time) * 1000 : undefined,
  });
  return before;
}

export type SourceInput = {
  run_id: string;
  step_id?: string;
  source_type: string;
  title?: string;
  url?: string;
  ref_id?: string;
  column_name?: string;
  snippet?: string;
  sample_size?: number;
  median_value?: number;
  confidence?: string;
};

export function addSource(input: SourceInput) {
  const source_id = "src_" + nanoid(12);
  db.insert(s.ai_run_sources)
    .values({
      id: source_id,
      run_id: input.run_id,
      step_id: input.step_id,
      source_type: input.source_type,
      title: input.title,
      url: input.url,
      ref_id: input.ref_id,
      column_name: input.column_name,
      snippet: input.snippet,
      sample_size: input.sample_size,
      median_value: input.median_value,
      confidence: input.confidence,
      retrieved_at: new Date().toISOString(),
    })
    .run();
  const src = db.select().from(s.ai_run_sources).where(eq(s.ai_run_sources.id, source_id)).all()[0];
  broadcast({ type: "source", run_id: input.run_id, step_id: input.step_id, source: src });
  return src;
}

export function addClaim(input: {
  run_id: string;
  step_id?: string;
  agent?: string;
  claim: string;
  claim_type?: string;
  sample_size?: number;
  confidence?: string;
}) {
  const claim_id = "clm_" + nanoid(12);
  db.insert(s.ai_claims)
    .values({
      id: claim_id,
      run_id: input.run_id,
      step_id: input.step_id,
      agent: input.agent,
      claim: input.claim,
      claim_type: input.claim_type,
      sample_size: input.sample_size,
      confidence: input.confidence,
    })
    .run();
  const c = db.select().from(s.ai_claims).where(eq(s.ai_claims.id, claim_id)).all()[0];
  broadcast({ type: "claim", run_id: input.run_id, step_id: input.step_id, claim: c });
  return c;
}

export function addEvidence(input: {
  claim_id: string;
  source_id?: string;
  supporting_claim_id?: string;
  snippet?: string;
  confidence?: string;
}) {
  const ev = db.insert(s.ai_evidence)
    .values({
      id: id("ev"),
      claim_id: input.claim_id,
      source_id: input.source_id,
      supporting_claim_id: input.supporting_claim_id,
      snippet: input.snippet,
      confidence: input.confidence,
    })
    .returning()
    .get();
  broadcast({ type: "evidence", claim_id: input.claim_id, evidence: ev });
  return ev;
}

export function addDecision(input: {
  run_id: string;
  step_id?: string;
  agent?: string;
  decision: string;
  target?: string;
  observation?: string;
  evidence?: string;
  interpretation?: string;
  action?: string;
  confidence?: string;
}) {
  const dec_id = "dec_" + nanoid(12);
  db.insert(s.ai_decisions)
    .values({
      id: dec_id,
      run_id: input.run_id,
      step_id: input.step_id,
      agent: input.agent ?? "director",
      decision: input.decision,
      target: input.target,
      observation: input.observation,
      evidence: input.evidence,
      interpretation: input.interpretation,
      action: input.action,
      confidence: input.confidence,
    })
    .run();
  const d = db.select().from(s.ai_decisions).where(eq(s.ai_decisions.id, dec_id)).all()[0];
  broadcast({ type: "decision", run_id: input.run_id, step_id: input.step_id, decision: d });
  return d;
}

export function logCost(input: {
  run_id: string;
  step_id?: string;
  provider?: string;
  model?: string;
  tokens?: number;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  cost?: number;
}) {
  db.insert(s.ai_costs)
    .values({
      id: id("cost"),
      run_id: input.run_id,
      step_id: input.step_id,
      provider: input.provider,
      model: input.model,
      tokens: input.tokens ?? (input.tokens_in ?? 0) + (input.tokens_out ?? 0),
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      latency_ms: input.latency_ms,
      cost: input.cost ?? 0,
    })
    .run();
}

export async function detectBackend(provider: any): Promise<{ backend_info?: string; device_info?: string }> {
  const cfg = (provider?.config ?? {}) as Record<string, unknown>;
  if (cfg.backend || cfg.device) {
    return {
      backend_info: cfg.backend ? String(cfg.backend) : undefined,
      device_info: cfg.device ? String(cfg.device) : undefined,
    };
  }
  if (provider?.kind === "local") {
    try {
      const r = await fetch(`${provider.base_url ?? "http://127.0.0.1:11434"}/api/ps`);
      const j = (await r.json()) as { models?: { size_vram?: number }[] };
      const totalVram = (j.models ?? []).reduce((a, m) => a + (m.size_vram ?? 0), 0);
      return {
        backend_info: totalVram > 0 ? "Vulkan/GPU" : "CPU",
        device_info: totalVram > 0 ? "GPU" : undefined,
      };
    } catch {
      return { backend_info: undefined, device_info: undefined };
    }
  }
  return { backend_info: provider?.kind === "remote" ? "cloud" : undefined, device_info: undefined };
}

// ---------- Prompt versions ----------

export function currentPrompt(agent: string): any | null {
  return db.select().from(s.prompt_versions).where(and(eq(s.prompt_versions.agent, agent), eq(s.prompt_versions.is_active, true))).all()[0] ?? null;
}

export function nextVersion(agent: string): number {
  const rows = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.agent, agent)).all();
  return rows.reduce((m, r) => Math.max(m, r.version ?? 0), 0) + 1;
}

export function savePrompt(input: {
  agent: string;
  content: string;
  system_prompt?: string;
  developer_prompt?: string;
  task_prompt?: string;
  context_template?: string;
  model_parameters?: Record<string, unknown>;
  change_summary?: string;
  created_by?: string;
  parent_version_id?: string;
  set_active?: boolean;
}): { id: string; version: number } {
  const version = nextVersion(input.agent);
  const pv_id = "pv_" + nanoid(12);
  db.insert(s.prompt_versions)
    .values({
      id: pv_id,
      agent: input.agent,
      version,
      content: input.content,
      system_prompt: input.system_prompt,
      developer_prompt: input.developer_prompt,
      task_prompt: input.task_prompt,
      context_template: input.context_template,
      model_parameters: input.model_parameters,
      change_summary: input.change_summary,
      created_by: input.created_by ?? "system",
      parent_version_id: input.parent_version_id,
      is_draft: input.set_active ? false : true,
      is_active: input.set_active ? true : false,
    })
    .run();
  if (input.set_active) {
    db.update(s.prompt_versions)
      .set({ is_active: false })
      .where(eq(s.prompt_versions.agent, input.agent))
      .run();
    db.update(s.prompt_versions)
      .set({ is_active: true, is_draft: false })
      .where(eq(s.prompt_versions.id, pv_id))
      .run();
  }
  broadcast({ type: "prompt", agent: input.agent, version, prompt_id: pv_id, is_active: !!input.set_active });
  return { id: pv_id, version };
}

export function activatePrompt(promptId: string) {
  const pv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, promptId)).all()[0];
  if (!pv) return null;
  db.update(s.prompt_versions).set({ is_active: false }).where(eq(s.prompt_versions.agent, pv.agent)).run();
  db.update(s.prompt_versions).set({ is_active: true, is_draft: false }).where(eq(s.prompt_versions.id, promptId)).run();
  broadcast({ type: "prompt", agent: pv.agent, version: pv.version, prompt_id: promptId, is_active: true });
  return pv;
}