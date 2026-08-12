import { runAgent, AgentRunResult } from "./orchestrator.js";
import { eq } from "drizzle-orm";
import { buildAnalystContext, buildDirectorContext, buildScriptwriterContext, buildMonetizationContext, getNicheBrief } from "./context.js";
import { computeAnalytics } from "../services/analytics.js";
import { getVideosWithMetrics } from "../services/data.js";
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { nanoid } from "nanoid";
import { currentRun } from "../brain/context.js";
import { addSource, addClaim, addEvidence, addDecision } from "../brain/service.js";

// Structured agent tasks. Each returns { agentRun, result } where result is
// deterministic analytics result possibly enhanced by LLM.

export async function analystAnalyze(nicheId?: string, opts: { useAI?: boolean } = {}) {
  // Deterministic analytics always runs
  const rows = await getVideosWithMetrics(nicheId);
  const analytics = computeAnalytics(rows);

  const rc = currentRun();
  let dbSourceId: string | undefined;
  if (rc && rows.length) {
    const src = addSource({
      run_id: rc.run_id,
      source_type: "DATABASE",
      title: `Аналитика: ${rows.length} видео`,
      ref_id: "analytics:aggregate",
      sample_size: rows.length,
      median_value: analytics.medianViews,
      confidence: "HIGH",
      snippet: `n=${rows.length} medianViews=${analytics.medianViews} medianApv=${analytics.medianApv}%`,
    });
    dbSourceId = src.id;
  }

  let llm: AgentRunResult | null = null;
  if (opts.useAI !== false && rows.length) {
    const ctx = await buildAnalystContext(nicheId);
    llm = await runAgent(
      "analyst",
      {
        nicheId,
        task: `Проанализируй данные. Отвечай СТРОГО на русском. Верни ТОЛЬКО JSON без markdown, ключи строго: findings, recommendations. Каждый finding: {claim, evidence, sample_size, confidence, correlation_only}. Каждый recommendation: {decision, target, reason, next_action}. Данные:\n${ctx}`.slice(0, 12000),
        params: { data_was: "aggregated" },
      },
      { capability: "analytical", maxTokens: 1500 }
    );
  }

  if (rc && llm?.parsed) {
    const findings = Array.isArray(llm.parsed.findings) ? llm.parsed.findings : [];
    const recommendations = Array.isArray(llm.parsed.recommendations) ? llm.parsed.recommendations : [];
    for (const f of findings.slice(0, 12)) {
      const cl = addClaim({
        run_id: rc.run_id,
        agent: "analyst",
        claim: String(f.claim ?? f.clm ?? ""),
        claim_type: "finding",
        sample_size: Number(f.sample_size) || undefined,
        confidence: String(f.confidence ?? "MEDIUM").toUpperCase(),
      });
      if (dbSourceId) addEvidence({ claim_id: cl.id, source_id: dbSourceId, snippet: String(f.evidence ?? "").slice(0, 300) });
    }
    for (const r of recommendations.slice(0, 10)) {
      addDecision({
        run_id: rc.run_id,
        agent: "analyst",
        decision: String(r.decision ?? "KEEP").toUpperCase(),
        target: String(r.target ?? ""),
        observation: "анализ метрик",
        interpretation: String(r.reason ?? ""),
        action: String(r.next_action ?? ""),
        confidence: String(r.confidence ?? "MEDIUM").toUpperCase(),
      });
    }
  }

  return {
    analytics,
    aiOutput: llm?.output ?? null,
    aiParsed: llm?.parsed ?? null,
    run: llm,
  };
}

export async function directorStrategy(nicheId?: string, userTask?: string) {
  const ctx = await buildDirectorContext(nicheId);
  const llm = await runAgent(
    "director",
    {
      nicheId,
      task: `Задача: ${userTask ?? "Что нам делать дальше?"}\n\nКонтекст системы:\n${ctx}\n\nОтвечай СТРОГО на русском языке. Верни ТОЛЬКО JSON без markdown и без пояснений. JSON keys строго: top_priorities, decisions, next_best_action. Каждый элемент top_priorities: {priority, why, evidence, action}. Формат:\n{"top_priorities":[{"priority":"PORTABLE TOP-1","why":"...","evidence":"...","action":"..."}],"decisions":[{"decision":"TEST","target":"...","reason":"...","confidence":"medium","next_action":"..."}],"next_best_action":"..."}`.slice(0, 15000),
      params: { user_task: userTask },
    },
    { capability: "strong_reasoning", maxTokens: 2000 }
  );

  // persist decisions
  const parsed = llm.parsed;
  const rc = currentRun();
  if (parsed && Array.isArray(parsed.decisions)) {
    for (const d of parsed.decisions.slice(0, 10)) {
      const decision = String(d.decision ?? "KEEP").toUpperCase();
      const target = String(d.target ?? "");
      const reason = String(d.reason ?? "");
      const nextAction = String(d.next_action ?? "");
      const confidence = String(d.confidence ?? "MEDIUM").toUpperCase();
      db.insert(s.decisions).values({
        id: "dec_" + nanoid(12),
        niche_id: nicheId,
        decision,
        target,
        reason,
        confidence,
        next_action: nextAction,
      }).run();
      if (rc) {
        addDecision({
          run_id: rc.run_id,
          agent: "director",
          decision,
          target,
          observation: "сводка по сети + аналитика",
          interpretation: reason,
          action: nextAction,
          confidence,
        });
      }
    }
  }
  return { output: llm.output, parsed: llm.parsed, run: llm };
}

export async function scriptwriterIdeas(nicheId?: string, count = 10, opts: { useAI?: boolean } = {}) {
  const ctx = await buildScriptwriterContext(nicheId);
  let llm: AgentRunResult | null = null;

  if (opts.useAI !== false) {
    llm = await runAgent(
      "scriptwriter",
      {
        nicheId,
        task: `Сгенерируй ${count} идей для вирусного контента на основе аналитики. Отвечай СТРОГО на русском. Верни ТОЛЬКО JSON без markdown, ключ строго: ideas. Для каждой идеи: {title, topic, hooks:[минимум 5], viral_score:0-100, score_breakdown:{}, evidence:"какая аналитика поддерживает", hypothesis:true/false}.\nКонтекст:\n${ctx}`.slice(0, 15000),
        params: { count },
      },
      { capability: "creative", temperature: 0.9, maxTokens: 2500 }
    );
  }

  const ideas: any[] = [];
  if (llm?.parsed?.ideas && Array.isArray(llm.parsed.ideas)) {
    ideas.push(...llm.parsed.ideas.slice(0, count));
  }

  // deterministic fallback: build ideas from best topics/hooks
  if (!ideas.length) {
    const rows = await getVideosWithMetrics(nicheId);
    const a = computeAnalytics(rows);
    const bestTopics = a.topicStats.filter((t) => t.n >= 2 && t.vsMedian > 0).slice(0, 4);
    const bestHooks = a.hookStats.filter((h) => h.n >= 2).slice(0, 3);
    for (let i = 0; i < Math.min(count, Math.max(3, bestTopics.length)); i++) {
      const topic = bestTopics[i % bestTopics.length]?.topic ?? "top-результаты";
      const hookType = bestHooks[i % bestHooks.length]?.type ?? "QUESTION";
      ideas.push({
        title: `Новое видео: топ-инсайт по теме "${topic}"`,
        topic,
        hooks: [`Новый факт про ${topic}, который меняет всё…`, `Почему про ${topic} молчат стримеры?`],
        viral_score: 70 + (a.topicStats[i % Math.max(1, a.topicStats.length)]?.n ?? 0),
        score_breakdown: { from_analytics: true },
        evidence: `он: topic ${topic} медиана ${a.topicStats[i]?.med} videos n=${a.topicStats[i]?.n}`,
        hypothesis: true,
      });
    }
  }

  // persist
  const inserted = [];
  const rc = currentRun();
  let iwSourceId: string | undefined;
  if (rc && ideas.length) {
    const src = addSource({
      run_id: rc.run_id,
      source_type: "DATABASE",
      title: "Лучшие темы и хуки из аналитики",
      ref_id: "analytics:topics",
      confidence: "MEDIUM",
      snippet: "топики/hooks с n>=2 из computeAnalytics",
    });
    iwSourceId = src.id;
  }
  for (const idea of ideas.slice(0, count)) {
    const id = "idea_" + nanoid(12);
    db.insert(s.ideas).values({
      id,
      niche_id: nicheId,
      title: String(idea.title ?? "Idea"),
      topic: String(idea.topic ?? ""),
      description: String(idea.evidence ?? idea.description ?? ""),
      hooks: Array.isArray(idea.hooks) ? idea.hooks.slice(0, 7).map(String) : [],
      viral_score: Number(idea.viral_score ?? 0),
      score_breakdown: idea.score_breakdown,
      source: "scriptwriter",
      language: "ru",
    }).run();
    inserted.push({ id, ...idea });
    if (rc && iwSourceId) {
      const cl = addClaim({
        run_id: rc.run_id,
        agent: "scriptwriter",
        claim: String(idea.title ?? ""),
        claim_type: "recommendation",
        sample_size: Number(idea.evidence?.sample) || undefined,
        confidence: "LOW",
      });
      addEvidence({ claim_id: cl.id, source_id: iwSourceId, snippet: String(idea.evidence ?? "").slice(0, 200) });
    }
  }

  return { ideas: inserted, aiOutput: llm?.output ?? null, run: llm };
}

export async function scriptwriterScript(ideaId: string, nicheId?: string) {
  const idea = db.select().from(s.ideas).where(eq(s.ideas.id, ideaId)).all()[0];
  if (!idea) throw new Error("idea not found");
  const ctx = await buildScriptwriterContext(nicheId ?? idea.niche_id ?? undefined);

  const llm = await runAgent(
    "scriptwriter",
    {
      nicheId,
      task: `Напиши сценарий для идеи: "${idea.title}" (тема: ${idea.topic}). Хуки: ${JSON.stringify(idea.hooks)}. Отвечай СТРОГО на русском (тексты сценария). Верни ТОЛЬКО JSON без markdown, корневой ключ строго: script. Создай retention map 0-2s,2-5s,5-10s,10-20s,20-30s,30-45s,45-60s для SHORT (30-45s): каждый сегмент {segment,voice,visual,text,sound,next_curiosity}. script содержит: hook,title,segments:[...],open_loops:[...],cta,production_time_min,copyright_risk,viral_score.\nКонтекст:\n${ctx}`.slice(0, 15000),
      params: { idea: idea.title },
    },
    { capability: "creative", temperature: 0.8, maxTokens: 2500 }
  );

  const scr = llm.parsed?.script;
  const scriptId = "scr_" + nanoid(12);
  if (scr) {
    db.insert(s.scripts).values({
      id: scriptId,
      idea_id: ideaId,
      niche_id: nicheId ?? idea.niche_id,
      title: String(scr.title ?? idea.title),
      hook: String(scr.hook ?? ""),
      body: scr,
      retention_map: scr.segments,
      viral_score: Number(scr.viral_score ?? idea.viral_score ?? 0),
      status: "draft",
      language: idea.language,
      production_time_min: Number(scr.production_time_min ?? 0),
      copyright_risk: scr.copyright_risk ? String(scr.copyright_risk) : null,
    }).run();
  }

  return { script: scr, output: llm.output, run: llm, scriptId };
}

export async function monetizationPlan(nicheId?: string, opts: { useAI?: boolean } = {}) {
  const ctx = await buildMonetizationContext(nicheId);
  const rc = currentRun();
  if (rc) {
    addSource({
      run_id: rc.run_id,
      source_type: "DATABASE",
      title: "Профиль аудитории + известные opportunities",
      ref_id: "audience:monetization",
      confidence: "MEDIUM",
      snippet: "channels, followers, monthly views, opportunities (verification status)",
    });
  }
  let llm: AgentRunResult | null = null;
  if (opts.useAI !== false) {
    llm = await runAgent(
      "monetization",
      {
        nicheId,
        task: `Составь план первой монетизации (first $10 -> $500) на основе данных. Отвечай СТРОГО на русском. Верни ТОЛЬКО JSON без markdown, ключи строго: revenue_ladder, risks, weekly_actions, evidence. Каждый элемент revenue_ladder: {level, followers_or_views, what_to_do, who_to_contact, what_to_sell, affiliates:[], sponsors:[], media_kit:false}. ДАННЫЕ:\n${ctx}`.slice(0, 12000),
        params: {},
      },
      { capability: "analytical", maxTokens: 2500 }
    );
  }
  return { output: llm?.output ?? null, parsed: llm?.parsed ?? null, run: llm, contextUsed: ctx.length };
}