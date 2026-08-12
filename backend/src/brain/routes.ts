import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createRun,
  updateRun,
  completeRun,
  failRun,
  createStep,
  updateStep,
  addSource,
  addClaim,
  addEvidence,
  addDecision,
  logCost,
  savePrompt,
  activatePrompt,
  currentPrompt,
  nextVersion,
} from "./service.js";
import { currentRun, runWithBrain } from "./context.js";
import { chatBestEffort, schedulerStatus, setModelCooldown, clearModelCooldown, markKeyCooldown, selectCandidates, isModelFree, nextCooldownAt } from "../ai/scheduler.js";
import { runDirectorOrchestration } from "../agents/orchestrator.js";
import { enqueueOrStart, processQueued, queueSnapshot } from "./queue.js";
import { kick } from "../ai/worker.js";
import { analystAnalyze, directorStrategy, scriptwriterIdeas, scriptwriterScript, monetizationPlan } from "../agents/tasks.js";

const nid = (p: string) => `${p}_${nanoid(12)}`;

function maskKey(k: string | undefined) {
  if (!k) return "";
  return k.length <= 8 ? "∗".repeat(k.length) : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function diffLines(a: string, b: string) {
  const A = String(a ?? "").split("\n");
  const B = String(b ?? "").split("\n");
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(A[i++]);
    else added.push(B[j++]);
  }
  while (i < m) removed.push(A[i++]);
  while (j < n) added.push(B[j++]);
  return { added, removed, added_count: added.length, removed_count: removed.length };
}

function qualityScore(res: any) {
  const len = Number(res.content?.length ?? 0);
  const parsed = (() => {
    try {
      const text = String(res.content ?? "").replace(/```(?:json)?\s*([\s\S]*?)```/, "$1");
      return JSON.parse(text);
    } catch { return null; }
  })();
  let score = 0;
  score += parsed ? 40 : 0;
  score += Math.min(30, Math.round(len / 80));
  const tin = res.tokens_in ?? 0, tout = res.tokens_out ?? 0;
  const tokens = tin + tout;
  score += Math.max(0, 20 - Math.round(Math.abs(tokens - Math.max(40, Math.round(len / 3))) / 40));
  score = Math.max(0, Math.min(100, score));
  const fail = Boolean(res.error);
  const complete = fail ? 0 : Boolean(parsed || len > 20) ? 1 : 0;
  return { total: score, json_valid: parsed ? 1 : 0, task_completion: complete, tokens, latency_ms: res.latency_ms ?? 0, cost: res.cost ?? 0 };
}

async function runDetail(runId: string) {
  const run = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, runId)).all()[0];
  if (!run) return null;
  const steps = db.select().from(s.ai_run_steps).where(eq(s.ai_run_steps.run_id, runId)).all();
  const sources = db.select().from(s.ai_run_sources).where(eq(s.ai_run_sources.run_id, runId)).all();
  const claims = db.select().from(s.ai_claims).where(eq(s.ai_claims.run_id, runId)).all();
  const evidence = db.select().from(s.ai_evidence).all().filter((e) => claims.some((c) => c.id === e.claim_id));
  const decisions = db.select().from(s.ai_decisions).where(eq(s.ai_decisions.run_id, runId)).all();
  const costs = db.select().from(s.ai_costs).where(eq(s.ai_costs.run_id, runId)).all();
  const prompt = run.prompt_version_id
    ? db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, run.prompt_version_id)).all()[0]
    : null;
  const related = db.select().from(s.agent_runs).where(eq(s.agent_runs.run_id, runId)).all();
  return { run, steps, sources, claims, evidence, decisions, costs, prompt, agent_runs: related };
}

export async function registerBrainRoutes(app: FastifyInstance) {
  // ---------- Runs ----------
  app.get("/api/brain/runs", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.ai_runs).all();
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.agent) rows = rows.filter((r) => r.main_agent === q.agent);
    if (q.limit) rows = rows.slice(0, Number(q.limit));
    return rows.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  });

  app.get("/api/brain/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = await runDetail(id);
    if (!d) return reply.status(404).send({ error: "run not found" });
    return d;
  });

  app.post("/api/brain/run", async (req, reply) => {
    const body = req.body as any;
    const task = String(body.task ?? "").trim();
    if (!task) return reply.status(400).send({ error: "task is required" });
    const niche_id = body.niche_id ? String(body.niche_id) : undefined;
    const dv = currentPrompt("director");
    const run_id = createRun({ user_request: task, main_agent: "director", niche_id, prompt_version_id: dv?.id });
    const outcome = await enqueueOrStart({ run_id, task, niche_id, prompt_version_id: dv?.id });
    kick();
    return { run_id, queued: outcome.queued ?? false, reason: outcome.queued ? outcome.reason : undefined };
  });

  // Chat: sends from the Brain chat tab. Records prompt version used.
  app.post("/api/brain/chat", async (req, reply) => {
    const body = req.body as any;
    const message = String(body.message ?? "").trim();
    if (!message) return reply.status(400).send({ error: "message is required" });
    const niche_id = body.niche_id ? String(body.niche_id) : undefined;
    const promptAgent = String(body.prompt_agent ?? "").trim() || undefined;
    const pvId = body.prompt_version_id ? String(body.prompt_version_id) : undefined;
    let mainAgent = "director";
    let promptVersionId: string | undefined = pvId;
    if (promptAgent) {
      const pv = pvId ? db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, pvId)).all()[0] : currentPrompt(promptAgent);
      if (pv) {
        mainAgent = promptAgent;
        promptVersionId = pv.id;
      }
    } else if (body.prompt_agent === "director" || !body.prompt_agent) {
      const dv = currentPrompt("director");
      if (dv) promptVersionId = dv.id;
    }
    const run_id = createRun({ user_request: message, main_agent: mainAgent, niche_id, prompt_version_id: promptVersionId });
    const outcome = await enqueueOrStart({ run_id, task: message, niche_id, prompt_version_id: promptVersionId });
    kick();
    return { run_id, main_agent: mainAgent, prompt_version_id: promptVersionId, queued: outcome.queued ?? false, reason: outcome.queued ? outcome.reason : undefined };
  });

  // Replay: same input + same (stored) prompt. Orchestrates fresh via queue.
  app.post("/api/brain/runs/:id/replay", async (req, reply) => {
    const { id } = req.params as { id: string };
    const original = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, id)).all()[0];
    if (!original) return reply.status(404).send({ error: "run not found" });
    const originalPrompt = original.prompt_version_id || undefined;
    const newRunId = createRun({ user_request: original.user_request, main_agent: "director", niche_id: original.niche_id || undefined, prompt_version_id: originalPrompt, provider: "replay" });
    const outcome = await enqueueOrStart({ run_id: newRunId, task: original.user_request, niche_id: original.niche_id || undefined, prompt_version_id: originalPrompt });
    kick();
    return { run_id: newRunId, replay_of: id, queued: outcome.queued ?? false };
  });

  // Run with CURRENT prompt (compare replay vs current)
  app.post("/api/brain/runs/:id/replay-current", async (req, reply) => {
    const { id } = req.params as { id: string };
    const original = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, id)).all()[0];
    if (!original) return reply.status(404).send({ error: "run not found" });
    const cur = currentPrompt("director");
    const newRunId = createRun({ user_request: original.user_request, main_agent: "director", niche_id: original.niche_id || undefined, prompt_version_id: cur?.id, provider: "replay" });
    const outcome = await enqueueOrStart({ run_id: newRunId, task: original.user_request, niche_id: original.niche_id || undefined, prompt_version_id: cur?.id });
    kick();
    return { run_id: newRunId, replay_of: id, prompt_version_id: cur?.id, queued: outcome.queued ?? false };
  });

  app.post("/api/brain/runs/:id/decision", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const run = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, id)).all()[0];
    if (!run) return reply.status(404).send({ error: "run not found" });
    addDecision({
      run_id: id,
      agent: body.agent ?? "director",
      decision: String(body.decision ?? "KEEP").toUpperCase(),
      target: body.target,
      observation: body.observation,
      evidence: body.evidence,
      interpretation: body.interpretation,
      action: body.action,
      confidence: body.confidence,
    });
    return { ok: true };
  });

  // ---------- Activity center ----------
  app.get("/api/brain/activity", async () => {
    const runs = db.select().from(s.ai_runs).all().sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)).slice(0, 50);
    const running = db.select().from(s.ai_run_steps).where(eq(s.ai_run_steps.status, "in_progress")).all();
    const activeIds = Array.from(new Set(running.map((st) => st.run_id)));
    const activeRuns = runs.filter((r) => activeIds.includes(r.id) || ["planning", "analyzing", "generating", "reading", "searching", "verifying", "fallback"].includes(r.status));
    const runningNow = activeRuns.filter((r) => r.status !== "failed" && r.status !== "completed");
    return {
      recent: runs.map((r) => ({ run_id: r.id, main_agent: r.main_agent, status: r.status, queued_reason: r.queued_reason, next_retry_at: r.next_retry_at, user_request: r.user_request, created_at: r.created_at, provider: r.provider, model: r.model, source_count: r.source_count })),
      running_now: running.reduce<Record<string, number>>((acc, st) => ((acc[st.agent] = (acc[st.agent] ?? 0) + 1), acc), {}),
      running_ids: activeIds,
      running_chain: runningNow.map((r) => r.main_agent).filter(Boolean),
      latest: runs[0] ?? null,
      queue: queueSnapshot(),
      counts: {
        running: runningNow.length,
        queued: queueSnapshot().length,
        failed: runs.filter((r) => r.status === "failed").slice(0, 10).length,
      },
    };
  });

  // ---------- Scheduler status (free-tier queue) ----------
  app.get("/api/brain/scheduler", async () => {
    return {
      ...schedulerStatus(),
      queue: queueSnapshot(),
    };
  });

  app.get("/api/brain/scheduler/pick", async () => {
    const c = selectCandidates({ strict: true });
    const best = c[0] ?? null;
    return {
      policy: schedulerStatus().policy,
      next_cooldown_at: nextCooldownAt(),
      pick: best ? { provider: best.provider.key, model: best.model.model_id, priority: best.model.priority, availability: best.model.availability } : null,
      candidates: c.slice(0, 6).map((x) => ({ provider: x.provider.key, model: x.model.model_id, priority: x.model.priority, availability: x.model.availability, free: isModelFree(x.model, x.provider) })),
    };
  });

  // Test / ops hooks — only enabled when ALLOW_TEST_HOOKS=1
  const hooks = process.env.ALLOW_TEST_HOOKS === "1";
  if (hooks) {
    app.post("/api/brain/scheduler/test/cooldown-key", async (req) => {
      const body = req.body as any;
      const secs = Number(body.seconds ?? 120);
      const rows = db.select().from(s.api_keys).where(body.provider ? eq(s.api_keys.provider, body.provider) : undefined).all();
      for (const r of rows) markKeyCooldown(r.id, r.provider, secs, "test cooldown", "429/test");
      return { marked: rows.length, seconds: secs };
    });
    app.post("/api/brain/scheduler/test/cooldown-model", async (req) => {
      const body = req.body as any;
      const secs = Number(body.seconds ?? 120);
      const rows = body.provider
        ? db.select().from(s.models).where(eq(s.models.provider_id, body.provider)).all()
        : db.select().from(s.models).all();
      for (const r of rows) setModelCooldown(r.id, secs);
      return { marked: rows.length, seconds: secs };
    });
    app.post("/api/brain/scheduler/test/clear-cooldowns", async () => {
      db.update(s.api_keys).set({ cooldown_until: null }).run();
      db.update(s.models).set({ cooldown_until: null }).run();
      return { ok: true };
    });
    app.post("/api/brain/scheduler/test/tick", async () => {
      const n = await processQueued();
      return { processed: n };
    });
  }

  // ---------- Prompts ----------
  app.get("/api/brain/prompts", async () => {
    const rows = db.select().from(s.prompt_versions).all().sort((a, b) => (a.agent === b.agent ? (a.version ?? 0) - (b.version ?? 0) : a.agent.localeCompare(b.agent)));
    // annotate per-agent active
    const actives = new Map<string, string>();
    for (const p of rows) if (p.is_active) actives.set(p.agent, p.id);
    return { versions: rows, active_by_agent: Object.fromEntries(actives) };
  });

  app.post("/api/brain/prompts", async (req) => {
    const body = req.body as any;
    const agent = String(body.agent ?? "").trim();
    if (!agent) throw new Error("agent is required");
    const saved = savePrompt({
      agent,
      content: String(body.content ?? ""),
      system_prompt: body.system_prompt,
      developer_prompt: body.developer_prompt,
      task_prompt: body.task_prompt,
      context_template: body.context_template,
      model_parameters: body.model_parameters,
      change_summary: body.change_summary,
      created_by: body.created_by ?? "user",
      parent_version_id: body.parent_version_id,
      set_active: body.set_active ?? false,
    });
    return { id: saved.id, version: saved.version };
  });

  app.get("/api/brain/prompts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, id)).all()[0];
    if (!pv) return reply.status(404).send({ error: "prompt not found" });
    const parent = pv.parent_version_id ? db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, pv.parent_version_id)).all()[0] : null;
    const diff = parent ? diffLines(parent.content ?? "", pv.content ?? "") : null;
    return { prompt: pv, parent, diff };
  });

  app.post("/api/brain/prompts/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pv = activatePrompt(id);
    if (!pv) return reply.status(404).send({ error: "prompt not found" });
    return { ok: true, active: { agent: pv.agent, version: pv.version } };
  });

  app.post("/api/brain/prompts/:id/rollback", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, id)).all()[0];
    if (!pv) return reply.status(404).send({ error: "prompt not found" });
    if (pv.parent_version_id) {
      activatePrompt(pv.parent_version_id);
      return { ok: true, rolled_back_to: pv.parent_version_id };
    }
    return { ok: false, error: "no parent version" };
  });

  app.post("/api/brain/prompts/:id/duplicate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, id)).all()[0];
    if (!pv) return reply.status(404).send({ error: "prompt not found" });
    const saved = savePrompt({
      agent: pv.agent,
      content: pv.content ?? "",
      system_prompt: pv.system_prompt ?? undefined,
      developer_prompt: pv.developer_prompt ?? undefined,
      task_prompt: pv.task_prompt ?? undefined,
      context_template: pv.context_template ?? undefined,
      model_parameters: pv.model_parameters ?? undefined,
      change_summary: `${pv.change_summary ?? "duplicate"} (копия)`,
      created_by: "user",
      parent_version_id: pv.id,
      set_active: false,
    });
    return { id: saved.id, version: saved.version };
  });

  app.post("/api/brain/prompts/compare", async (req) => {
    const body = req.body as any;
    const aId = body.prompt_a, bId = body.prompt_b;
    const pa = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, aId)).all()[0];
    const pb = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, bId)).all()[0];
    if (!pa || !pb) throw new Error("one of the prompts not found");
    const diff = diffLines(pa.content ?? "", pb.content ?? "");
    return { a: pa, b: pb, diff };
  });

  // A/B test two prompt versions on same input
  app.post("/api/brain/prompts/ab", async (req) => {
    const body = req.body as any;
    const input = String(body.input ?? "").trim();
    if (!input) throw new Error("input is required");
    const runAB = async (pv: any) => {
      const started = Date.now();
      try {
        const res = await chatBestEffort(
          [
            { role: "system", content: pv.content ?? "" },
            { role: "user", content: input },
          ],
          { capability: body.capability ?? "general", temperature: 0.4, maxTokens: body.max_tokens ?? 1024 }
        );
        return { ...res, q: qualityScore(res), latency_ms: Date.now() - started };
      } catch (e) {
        return { error: (e as Error).message, q: qualityScore({ error: true }), latency_ms: Date.now() - started };
      }
    };
    const inputs: any[] = [];
    if (body.prompt_a) inputs.push(db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, body.prompt_a)).all()[0]);
    if (body.prompt_b) inputs.push(db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, body.prompt_b)).all()[0]);
    if (inputs.length < 2) throw new Error("need two prompt ids (prompt_a, prompt_b)");
    const [ra, rb] = await Promise.all([runAB(inputs[0]), runAB(inputs[1])]);
    return {
      input,
      results: [
        { prompt_id: inputs[0].id, version: inputs[0].version, ...ra },
        { prompt_id: inputs[1].id, version: inputs[1].version, ...rb },
      ],
      winner: ra.error ? "B" : rb.error ? "A" : (ra.q.total ?? 0) >= (rb.q.total ?? 0) ? "A" : "B",
      cost: { a: ra.cost ?? 0, b: rb.cost ?? 0 },
    };
  });

  // Safety benchmark: run new version vs active on fixed input dataset
  app.post("/api/brain/prompts/benchmark", async (req) => {
    const body = req.body as any;
    const newPv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, body.prompt_id)).all()[0];
    if (!newPv) throw new Error("prompt not found");
    const active = currentPrompt(newPv.agent);
    if (!active) return { message: "no active prompt to compare", warning: false };
    const bench = body.dataset ?? [
      "Что нам делать дальше в нише CS2?",
      "Проанализируй последние видео и найди лучшие темы.",
      "Предложи идеи для 5 вирусных видео.",
    ];
    const score = async (pv: any) => {
      let total = 0;
      const details: any[] = [];
      for (const item of bench) {
        try {
          const res = await chatBestEffort([{ role: "system", content: pv.content ?? "" }, { role: "user", content: String(item) }], { capability: "general", temperature: 0.3, maxTokens: 600 });
          const q = qualityScore(res);
          total += q.total;
          details.push({ input: item, ...q, sample: String(res.content ?? "").slice(0, 120) });
        } catch (e) {
          details.push({ input: item, error: (e as Error).message, total: 0 });
        }
      }
      return { avg: Math.round(total / Math.max(1, bench.length)), total, details };
    };
    const oldScore = await score(active);
    const newScore = await score(newPv);
    const diff = newScore.avg - oldScore.avg;
    const warning = diff <= -10;
    return {
      previous_version: active.version,
      previous_score: oldScore.avg,
      new_version: newPv.version,
      new_score: newScore.avg,
      difference: diff,
      warning,
      details: { old: oldScore.details, new: newScore.details },
      message: warning
        ? `Новая версия на ${Math.abs(diff)} пунктов хуже. Production не переключён автоматически.`
        : `Новая версия: ${diff >= 0 ? `+${diff}` : diff} пунктов. ${body.activate ? "Активируйте через отдельный запрос." : ""}`,
    };
  });

  // AI proofreader: another AI critiques / corrects the prompt
  app.post("/api/brain/prompts/proofread", async (req) => {
    const body = req.body as any;
    const agent = String(body.agent ?? "").trim();
    const content = String(body.content ?? "");
    if (!content.trim()) throw new Error("content is required");
    const proofSystem = `You are a strict prompt engineer & editor. Given a system prompt for an AI agent (${agent || "general"}), return ONLY JSON with keys: issues (array of strings), suggestions (array of specific improvements), revised (the corrected full system prompt text, Russian/English as appropriate). Fix ambiguity, dangerous instructions, redundancy and add structured output format requests. Keep spirit.`;
    const res = await chatBestEffort(
      [
        { role: "system", content: proofSystem },
        { role: "user", content: `PROMPT TO REVIEW:\n"""\n${content}\n"""` },
      ],
      { capability: "analytical", temperature: 0.3, maxTokens: 3000 }
    );
    let parsed: any = null;
    try {
      parsed = JSON.parse(String(res.content).replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim());
    } catch {
      parsed = null;
    }
    return {
      output: res.content,
      revised: parsed?.revised ?? null,
      issues: parsed?.issues ?? [],
      suggestions: parsed?.suggestions ?? [],
      provider: res.provider,
      model: res.model,
    };
  });

  // ---------- Agents / Brain ----------
  app.get("/api/brain/agents", async () => {
    const agents = db.select().from(s.agents).all();
    const runs = db.select().from(s.agent_runs).all();
    const prompts = db.select().from(s.prompt_versions).all();
    const aicosts = db.select().from(s.ai_costs).all();
    const cfg = db.select().from(s.agent_configs).all();
    const out = [];
    for (const a of agents) {
      const myRuns = runs.filter((r) => r.agent_key === a.key);
      const success = myRuns.filter((r) => r.status === "done").length;
      const latency = myRuns.filter((r) => r.latency_ms).map((r) => r.latency_ms ?? 0);
      const costs = aicosts.filter((c) => (c.provider ?? "").includes(a.key) || myRuns.some((r) => r.step_id && c.step_id === r.step_id));
      const successRate = myRuns.length ? Math.round((success / myRuns.length) * 100) : 0;
      const activePv = prompts.find((p) => p.agent === a.key && p.is_active);
      const conf = cfg.find((c) => c.agent_key === a.key);
      out.push({
        key: a.key,
        name: a.name,
        role: a.role,
        description: a.description,
        purpose: conf?.purpose ?? a.description,
        active_prompt_version: activePv ? { id: activePv.id, version: activePv.version } : null,
        default_model: conf?.default_model ?? null,
        default_provider: conf?.default_provider ?? null,
        last_runs: myRuns.slice(-5).map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, latency_ms: r.latency_ms, cost: r.cost, model: r.model, provider: r.provider })),
        success_rate: successRate,
        avg_latency_ms: latency.length ? Math.round(latency.reduce((a, b) => a + b, 0) / latency.length) : 0,
        total_runs: myRuns.length,
        cost: costs.reduce((acc, c) => acc + (c.cost ?? 0), 0),
        config: conf ?? null,
      });
    }
    return out;
  });

  app.get("/api/brain/agents/:key/brain", async (req, reply) => {
    const { key } = req.params as { key: string };
    const agent = db.select().from(s.agents).where(eq(s.agents.key, key)).all()[0];
    if (!agent) return reply.status(404).send({ error: "agent not found" });
    const conf = db.select().from(s.agent_configs).where(eq(s.agent_configs.agent_key, key)).all()[0] ?? null;
    const prompts = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.agent, key)).all().sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
    const active = prompts.find((p) => p.is_active);
    const decisions = db.select().from(s.ai_decisions).where(eq(s.ai_decisions.agent, key)).all().slice(-30);
    const runs = db.select().from(s.agent_runs).where(eq(s.agent_runs.agent_key, key)).all().slice(-30).reverse();
    return {
      agent,
      config: conf,
      current_system_prompt: active?.content ?? agent.system_prompt ?? "",
      prompt_version: active ? { id: active.id, version: active.version } : null,
      prompt_history: prompts.map((p) => ({ id: p.id, version: p.version, change_summary: p.change_summary, created_by: p.created_by, created_at: p.created_at, is_active: p.is_active, success_rate: p.success_rate })),
      decision_framework: conf?.decision_framework ?? null,
      rules: conf?.rules_config ?? null,
      sub_agents: conf?.sub_agents_config ?? null,
      tools: conf?.tools_config ?? null,
      available_data: conf?.available_data_config ?? null,
      memory: conf?.memory ?? {},
      recent_decisions: decisions,
      recent_runs: runs.map((r) => ({ id: r.id, status: r.status, model: r.model, provider: r.provider, latency_ms: r.latency_ms, cost: r.cost, created_at: r.created_at })),
    };
  });

  app.post("/api/brain/agents/:key/config", async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as any;
    const existing = db.select().from(s.agent_configs).where(eq(s.agent_configs.agent_key, key)).all()[0];
    const patch = {
      purpose: body.purpose,
      active_prompt_version_id: body.active_prompt_version_id ?? existing?.active_prompt_version_id,
      default_model: body.default_model ?? existing?.default_model,
      default_provider: body.default_provider ?? existing?.default_provider,
      rules_config: body.rules_config ?? existing?.rules_config,
      decision_framework: body.decision_framework ?? existing?.decision_framework,
      sub_agents_config: body.sub_agents_config ?? existing?.sub_agents_config,
      tools_config: body.tools_config ?? existing?.tools_config,
      available_data_config: body.available_data_config ?? existing?.available_data_config,
      memory: body.memory !== undefined ? body.memory : existing?.memory, // MERGE below
    } as any;
    if (body.memory && existing?.memory) {
      patch.memory = { ...(existing.memory as any), ...(body.memory as any) };
    }
    if (existing) {
      db.update(s.agent_configs).set({ ...patch, updated_at: Math.floor(Date.now() / 1000) }).where(eq(s.agent_configs.agent_key, key)).run();
    } else {
      db.insert(s.agent_configs).values({ agent_key: key, ...patch }).run();
    }
    return { ok: true, key };
  });

  // ---------- Cost center ----------
  app.get("/api/brain/costs", async () => {
    const costs = db.select().from(s.ai_costs).all();
    const sum = (rows: any[]) => rows.reduce((a, c) => a + (c.cost ?? 0), 0);
    const now = Date.now() / 1000;
    const day = costs.filter((c) => c.created_at && now - c.created_at < 86400);
    const week = costs.filter((c) => c.created_at && now - c.created_at < 86400 * 7);
    const month = costs.filter((c) => c.created_at && now - c.created_at < 86400 * 30);
    const byProvider: Record<string, { tokens: number; requests: number; latency_ms: number; cost: number }> = {};
    for (const c of costs) {
      const p = c.provider ?? "unknown";
      byProvider[p] ??= { tokens: 0, requests: 0, latency_ms: 0, cost: 0 };
      byProvider[p].tokens += c.tokens ?? 0;
      byProvider[p].requests += c.requests ?? 1;
      byProvider[p].latency_ms += c.latency_ms ?? 0;
      byProvider[p].cost += c.cost ?? 0;
    }
    return {
      policy: "free-only",
      today_usd: sum(day),
      week_usd: sum(week),
      month_usd: sum(month),
      all_usd: sum(costs),
      requests: costs.length,
      by_provider: byProvider,
      usage: costs.slice(-200).reverse().map((c) => ({ provider: c.provider, model: c.model, tokens: c.tokens, latency_ms: c.latency_ms, cost: c.cost, created_at: c.created_at })),
    };
  });

  // ---------- Decision trace ----------
  app.get("/api/brain/trace/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = db.select().from(s.ai_runs).where(eq(s.ai_runs.id, runId)).all()[0];
    if (!run) return reply.status(404).send({ error: "run not found" });
    const steps = db.select().from(s.ai_run_steps).where(eq(s.ai_run_steps.run_id, runId)).all();
    const sources = db.select().from(s.ai_run_sources).where(eq(s.ai_run_sources.run_id, runId)).all();
    const claims = db.select().from(s.ai_claims).where(eq(s.ai_claims.run_id, runId)).all();
    const decisions = db.select().from(s.ai_decisions).where(eq(s.ai_decisions.run_id, runId)).all();
    const evidence = db.select().from(s.ai_evidence).all().filter((e) => claims.some((c) => c.id === e.claim_id));
    // Audit trail: USER REQUEST → RUN → STEPS → SOURCES → CLAIMS → EVIDENCE → DECISIONS → OUTPUT
    return {
      user_request: run.user_request,
      run_status: run.status,
      trail: {
        steps: steps.map((st) => ({ id: st.id, agent: st.agent, step_type: st.step_type, status: st.status, label: st.label, output_summary: st.output_summary, model: st.model, provider: st.provider })),
        sources: sources.map((sr) => ({ id: sr.id, source_type: sr.source_type, title: sr.title, sample_size: sr.sample_size, median_value: sr.median_value, confidence: sr.confidence })),
        claims,
        evidence,
        decisions,
      },
      final_result: run.final_result,
      model: run.model,
      provider: run.provider,
      backend_info: run.backend_info,
      device_info: run.device_info,
      total_tokens: run.total_tokens,
      total_cost: run.total_cost,
      duration_ms: run.duration_ms,
      created_at: run.created_at,
    };
  });

  // ---------- API keys management (Settings → API Keys) ----------
  app.get("/api/settings/keys", async () => {
    const rows = db.select().from(s.api_keys).all().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const now = Math.floor(Date.now() / 1000);
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label,
      key_masked: maskKey(r.key_value),
      enabled: r.enabled,
      priority: r.priority,
      has_key: Boolean(r.key_value),
      cooldown_until: r.cooldown_until,
      cooldown_left_s: (r.cooldown_until ?? 0) > now ? (r.cooldown_until ?? 0) - now : 0,
      last_status: r.last_status,
      last_error: r.last_error,
      rate_limit_count: r.rate_limit_count,
      last_used_at: r.last_used_at,
      created_at: r.created_at,
    }));
  });

  // Accept a batch: { provider, keys: ["k1","k2"] } or { provider, batch: "k1\nk2" } or { provider, keys: [{label,key,priority}] }
  app.post("/api/settings/keys", async (req) => {
    const body = req.body as any;
    const provider = String(body.provider ?? "").trim();
    if (!provider) throw new Error("provider is required");
    let entries: { label?: string; key?: string; priority?: number }[] = [];
    if (Array.isArray(body.keys)) {
      entries = body.keys.map((k: any) => (typeof k === "string" ? { key: k } : { label: k.label, key: k.key_value ?? k.key, priority: k.priority }));
    }
    if (body.batch) {
      const parts = String(body.batch)
        .split(/[\n\r,;]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      entries.push(...parts.map((p: string) => /^(AIza|sk-or-)/i.test(p) ? { key: p } : { key: p }));
    }
    entries = entries.filter((e) => e.key && String(e.key).trim().length >= 8);
    const inserted = [];
    for (const e of entries) {
      const id = nid("key");
      db.insert(s.api_keys).values({
        id,
        provider,
        label: e.label ?? `${provider} key`,
        key_value: String(e.key).trim(),
        enabled: true,
        priority: e.priority ?? 0,
      }).run();
      inserted.push({ id, label: e.label ?? `${provider} key`, key_masked: maskKey(String(e.key).trim()) });
    }
    return { inserted: inserted.length, keys: inserted };
  });

  app.delete("/api/settings/keys/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(s.api_keys).where(eq(s.api_keys.id, id)).all()[0];
    if (!row) return reply.status(404).send({ error: "key not found" });
    db.delete(s.api_keys).where(eq(s.api_keys.id, id)).run();
    return { ok: true };
  });

  app.get("/api/brain/diagnostic", async (req) => {
    const counts = {
      runs: db.select().from(s.ai_runs).all().length,
      steps: db.select().from(s.ai_run_steps).all().length,
      sources: db.select().from(s.ai_run_sources).all().length,
      claims: db.select().from(s.ai_claims).all().length,
      evidence: db.select().from(s.ai_evidence).all().length,
      decisions: db.select().from(s.ai_decisions).all().length,
      prompts: db.select().from(s.prompt_versions).all().length,
      costs: db.select().from(s.ai_costs).all().length,
      keys: db.select().from(s.api_keys).all().length,
    };
    return { counts };
  });
}