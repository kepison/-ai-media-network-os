import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chat, ChatMessage, parseJsonLoose } from "../ai/gateway.js";
import { currentRun, runWithBrain } from "../brain/context.js";
import { createRun, createStep, updateStep, updateRun, completeRun, failRun, logCost, detectBackend, addSource } from "../brain/service.js";
import { getVideosWithMetrics } from "../services/data.js";

export type AgentInput = {
  nicheId?: string;
  task: string;
  params?: Record<string, unknown>;
};

export type AgentRunResult = {
  run_id: string;
  agent_key: string;
  output: string;
  parsed?: any;
  model: string;
  provider: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms: number;
  cost: number;
  confidence?: string;
  error?: string;
  fallback?: boolean;
};

const ARCHIVE: Record<string, string[]> = {
  director: ["Команда директора:"],
  analyst: ["Ты аналитик."],
  scriptwriter: ["Ты сценарист."],
  monetization: ["Ты монетизация."],
};

const STEP_LABELS: Record<string, string> = {
  director: "Director — планирование",
  analyst: "Analyst — анализ данных",
  scriptwriter: "Scriptwriter — генерация",
  monetization: "Monetization — стратегия",
};

async function providerObj(key: string) {
  return db.select().from(s.model_providers).where(eq(s.model_providers.key, key)).all()[0] ?? null;
}

export async function runAgent(agentKey: string, input: AgentInput, opts: { capability?: string; temperature?: number; maxTokens?: number } = {}): Promise<AgentRunResult> {
  const agent = db.select().from(s.agents).where(eq(s.agents.key, agentKey)).all()[0];
  if (!agent) throw new Error(`Agent "${agentKey}" not found`);
  if (!agent.enabled) throw new Error(`Agent "${agentKey}" is disabled`);

  const cfg = (agent.model_config ?? {}) as any;
  const capability = opts.capability ?? cfg.capability ?? agentKey === "director" ? "strong_reasoning" : "general";

  const rc = currentRun();
  // prompt version override: if a version is pinned on the run, use its content for this agent
  let system = agent.system_prompt ?? ARCHIVE[agentKey]?.[0] ?? "Ты — автономный агент.";
  if (rc?.prompt_version_id) {
    const pv = db.select().from(s.prompt_versions).where(eq(s.prompt_versions.id, rc.prompt_version_id)).all()[0];
    if (pv && pv.agent === agentKey && pv.content) system = pv.content;
  }
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: input.task },
  ];

  const runId = "run_" + nanoid(12);
  const stepId = rc ? createStep({
    run_id: rc.run_id,
    agent: agentKey,
    step_type: "generation",
    label: STEP_LABELS[agentKey] ?? agent.name,
    prompt_version_id: rc.prompt_version_id,
    input_summary: input.task.slice(0, 300),
  }) : undefined;

  db.insert(s.agent_runs).values({
    id: runId,
    agent_key: agentKey,
    task: input.task,
    input: input.params ?? {},
    niche_id: input.nicheId,
    run_id: rc?.run_id,
    step_id: stepId,
    status: "running",
  }).run();

  const started = Date.now();
  let fallbackUsed = false;

  try {
    let res: any;
    let firstErr = "";
    try {
      res = await chat(messages, {
        capability,
        temperature: opts.temperature ?? cfg.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? cfg.maxTokens,
      });
    } catch (e1) {
      firstErr = (e1 as Error).message;
      if (firstErr.startsWith("NO_KEY") || firstErr.startsWith("PROVIDER_ERR") || firstErr.startsWith("GATEWAY_ERR")) {
        try {
          res = await chat(messages, { providerKey: "ollama", capability, temperature: opts.temperature ?? cfg.temperature ?? 0.7, maxTokens: opts.maxTokens ?? cfg.maxTokens });
          fallbackUsed = true;
        } catch (e2) {
          throw new Error(`FALLBACK_FAILED_PRIOR=${firstErr.slice(0, 200)} | OLLAMA=${(e2 as Error).message.slice(0, 200)}`);
        }
      } else {
        throw e1;
      }
    }

    const parsed = parseJsonLoose(res.content);
    const backend = await detectBackend(await providerObj(res.provider));
    const latency = Date.now() - started;

    db.update(s.agent_runs)
      .set({
        status: "done",
        model: res.model,
        provider: res.provider,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        latency_ms: latency,
        cost: res.cost,
        output: { content: res.content, parsed, fallback: fallbackUsed },
        confidence: parsed?.confidence,
      })
      .where(eq(s.agent_runs.id, runId))
      .run();

    if (stepId) {
      updateStep(stepId, {
        status: fallbackUsed ? "fallback" : "completed",
        output_summary: res.content.slice(0, 500),
        detail: { prompt: system.slice(0, 600), parsed },
        source_count: 0,
        tokens: (res.tokens_in ?? 0) + (res.tokens_out ?? 0),
        cost: res.cost,
        confidence: parsed?.confidence,
        model: res.model,
        provider: res.provider,
        backend_info: backend.backend_info,
        device_info: backend.device_info,
      });
      if (rc) {
        logCost({
          run_id: rc.run_id,
          step_id: stepId,
          provider: res.provider,
          model: res.model,
          tokens_in: res.tokens_in,
          tokens_out: res.tokens_out,
          latency_ms: latency,
          cost: res.cost,
        });
      }
    }

    return {
      run_id: runId,
      agent_key: agentKey,
      output: res.content,
      parsed,
      model: res.model,
      provider: res.provider,
      tokens_in: res.tokens_in,
      tokens_out: res.tokens_out,
      latency_ms: latency,
      cost: res.cost,
      confidence: parsed?.confidence,
      fallback: fallbackUsed,
    };
  } catch (e) {
    const err = (e as Error).message;
    const latency = Date.now() - started;
    db.update(s.agent_runs)
      .set({ status: "error", latency_ms: latency, error: err })
      .where(eq(s.agent_runs.id, runId))
      .run();
    if (stepId) {
      updateStep(stepId, {
        status: "failed",
        error: err,
        detail: { prompt: system.slice(0, 600) },
      });
    }
    return {
      run_id: runId,
      agent_key: agentKey,
      output: "",
      model: "",
      provider: "",
      latency_ms: latency,
      cost: 0,
      error: err,
      fallback: fallbackUsed,
    } as any;
  }
}

export type OrchestrationResult = {
  run_id: string;
  plan: any;
  needed: string[];
  subtasks: Record<string, any>;
  final: AgentRunResult;
  status: string;
};

export async function runDirectorOrchestration(task: string, nicheId?: string, runId?: string, promptVersionId?: string): Promise<OrchestrationResult> {
  const run_id = runId ?? createRun({ user_request: task, main_agent: "director", niche_id: nicheId, prompt_version_id: promptVersionId });
  if (!runId && promptVersionId) updateRun(run_id, { prompt_version_id: promptVersionId });
  const planStep = createStep({ run_id, agent: "director", step_type: "planning", label: "Director — анализ задачи" });

  return runWithBrain({ run_id, niche_id: nicheId, prompt_version_id: promptVersionId }, async () => {
    const run1 = await runAgent(
      "director",
      {
        nicheId,
        task: `Ты директор. Пользователь поставил задачу: "${task}". Реши, какие под-агенты должны выполнить работу. Доступны: analyst (анализ статистики), scriptwriter (генерация идей и сценариев), monetization (монетизация). Отвечай СТРОГО на русском. Верни ТОЛЬКО JSON без markdown, ключи строго: needed (массив из доступных: analyst/scriptwriter/monetization), plan (краткий план на русском).`,
        params: { original_task: task },
      },
      { capability: "strong_reasoning", maxTokens: 500 }
    );
    updateStep(planStep, { status: "completed", output_summary: (run1.output ?? "").slice(0, 500), detail: { plan: run1.parsed?.plan } });

    // deterministic fallback inference — always computed
    const fallbackNeeded: string[] = [];
    if (/анализ|проанализ|смотр.*статистик|winners|losers|retention|данные|видео/i.test(task)) fallbackNeeded.push("analyst");
    if (/иде|скрипт|сценар|script|video idea|10 идей|контент/i.test(task)) fallbackNeeded.push("scriptwriter");
    if (/монетиз|деньг|affiliate|спонсор|revenue|заработ|\$|доллар/i.test(task)) fallbackNeeded.push("monetization");
    if (!fallbackNeeded.length) fallbackNeeded.push("analyst");

    let needed = fallbackNeeded;
    if (run1.parsed && Array.isArray(run1.parsed.needed) && run1.parsed.needed.length) {
      const fromAI = run1.parsed.needed
        .map((x: unknown) => String(x).toLowerCase().replace(/[^a-z]/g, ""))
        .filter((x: string) => ["analyst", "scriptwriter", "monetization"].includes(x));
      const union = Array.from(new Set([...fallbackNeeded, ...fromAI]));
      needed = union.length ? union : fallbackNeeded;
    }
    needed = Array.from(new Set(needed)).slice(0, 3);

    updateRun(run_id, { status: "analyzing", main_agent: "director" });

    const results: Record<string, any> = {};
    for (const a of needed) {
      const dataStep = a === "analyst" ? createStep({ run_id, agent: "director", step_type: "data_loading", label: "Загрузка данных" }) : null;
      if (dataStep) {
        const rows = await getVideosWithMetrics(nicheId);
        addSource({
          run_id,
          step_id: dataStep,
          source_type: "DATABASE",
          title: "Видео с метриками",
          ref_id: "videos+metrics",
          sample_size: rows.length,
          confidence: "HIGH",
          snippet: `${rows.length} видео (views/retention/format/topic)`,
        });
        updateStep(dataStep, { status: "completed", output_summary: `${rows.length} видео загружено`, source_count: 1 });
      }
      const r = await runAgent(a, { nicheId, task: `Контекст (от директора): ${task}`, params: { director_task: task } }, {});
      results[a] = { output: r.output, parsed: r.parsed };
    }

    updateRun(run_id, { status: "generating" });

    const final = await runAgent(
      "director",
      {
        nicheId,
        task: `Отвечай СТРОГО на русском. Верни ТОЛЬКО JSON без markdown, ключи строго: top_priorities, next_best_action. Формат ответа пользователю на задачу: "${task}".\nРезультаты под-агентов:\n${JSON.stringify(results, null, 2)}`.slice(0, 12000),
        params: { subtask_results: results },
      },
      { capability: "strong_reasoning", maxTokens: 2000 }
    );

    const finalStep = createStep({ run_id, agent: "director", step_type: "final", label: "Final result", input_summary: task.slice(0, 200) });
    updateStep(finalStep, { status: "completed", output_summary: (final.output ?? "").slice(0, 800), detail: { parsed: final.parsed } });

    let status = "completed";
    if (final.error) status = "failed";
    if (final.fallback) status = "fallback";
    if (final.error) {
      failRun(run_id, final.error, final.fallback ? "ollama" : undefined);
    } else {
      completeRun(run_id, final.output, { main_agent: "director", model: final.model, provider: final.provider, source_count: 2 });
    }

    return { run_id, plan: run1.parsed?.plan ?? null, needed, subtasks: results, final, status };
  });
}