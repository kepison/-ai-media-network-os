import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getVideosWithMetrics, listVideos, listMetrics } from "../services/data.js";
import { computeAnalytics } from "../services/analytics.js";
import { detectColumns, parseImport, importVideos, exportData, normalizeHeader } from "../services/import.js";
import { analystAnalyze, directorStrategy, scriptwriterIdeas, scriptwriterScript, monetizationPlan } from "../agents/tasks.js";
import { runDirectorOrchestration } from "../agents/orchestrator.js";
import { serverHealth, modelRouterHealth } from "../ai/gateway.js";

export async function registerApi(app: FastifyInstance) {
  const api = async (route: string, handler: any) => {
    app.get(route, handler);
  };
  void api;

  // ---------- System / health ----------
  app.get("/api/health", async () => {
    const providers = await serverHealth();
    let frontend = "OK";
    const dbStatus = await dbHealth();
    return {
      status: "OK",
      time: new Date().toISOString(),
      modules: {
        frontend: frontend,
        backend: "OK",
        database: dbStatus,
        gateway: "OK",
      },
      providers,
      router: modelRouterHealth(),
    };
  });

  // ---------- Dashboard / network overview ----------
  app.get("/api/dashboard", async (req) => {
    const q = req.query as any;
    const nicheId = q.niche_id || undefined;
    const rows = await getVideosWithMetrics(nicheId);
    const analytics = computeAnalytics(rows);
    const exps = db.select().from(s.experiments).all();
    const tasks = db.select().from(s.tasks).all();
    const revenue = db.select().from(s.revenue).all();
    const agentRuns = db.select().from(s.agent_runs).all();
    const aiCost = agentRuns.reduce((a, r) => a + (r.cost ?? 0), 0);
    return {
      summary: {
        videos: rows.length,
        total_views: rows.reduce((a, r) => a + r.views, 0),
        median_views: analytics.medianViews,
        total_followers_gained: rows.reduce((a, r) => a + (r.followers_gained ?? 0), 0),
        revenue: revenue.reduce((a, r) => a + r.amount, 0),
        ai_cost: Math.round(aiCost * 10000) / 10000,
        channels: db.select().from(s.channels).all().length,
        niches: db.select().from(s.niches).all().length,
        experiments_active: exps.filter((e) => e.status === "active").length,
        open_tasks: tasks.filter((t) => t.status === "open").length,
        agent_runs: agentRuns.length,
      },
      analytics: {
        winners: analytics.winners.slice(0, 5),
        losers: analytics.losers.slice(0, 5),
        topicStats: analytics.topicStats,
        findings: analytics.findings,
        decisions: analytics.decisions,
      },
    };
  });

  // ---------- Taxonomy ----------
  app.get("/api/taxonomy", async () => {
    const topics = db.select().from(s.topics).all();
    return topics;
  });

  // ---------- Networks / Niches / Brands / Channels ----------
  app.get("/api/tree", async () => {
    const networks = db.select().from(s.networks).all();
    const niches = db.select().from(s.niches).all();
    const brands = db.select().from(s.brands).all();
    const channels = db.select().from(s.channels).all();
    const platforms = db.select().from(s.platforms).all();
    return {
      networks,
      niches,
      brands,
      channels,
      platforms,
      tree: networks.map((n) => ({
        ...n,
        niches: niches
          .filter((nc) => nc.network_id === n.id)
          .map((nc) => ({
            ...nc,
            brands: brands
              .filter((b) => b.niche_id === nc.id)
              .map((b) => ({
                ...b,
                channels: channels.filter((c) => c.brand_id === b.id),
              })),
          })),
      })),
    };
  });

  app.post("/api/niches", async (req) => {
    const body = req.body as any;
    const id = "nc_" + nanoid(12);
    db.insert(s.niches).values({
      id,
      network_id: body.network_id,
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-"),
      description: body.description,
      languages: body.languages ?? ["ru", "en"],
      geos: body.geos ?? [],
      taxonomy: body.taxonomy ?? [],
      content_formats: body.content_formats ?? [],
      audience_profile: body.audience_profile ?? {},
      is_demo: body.is_demo ?? false,
    }).run();
    return { id };
  });

  app.post("/api/brands", async (req) => {
    const body = req.body as any;
    const id = "br_" + nanoid(12);
    db.insert(s.brands).values({
      id,
      niche_id: body.niche_id,
      name: body.name,
      language: body.language,
      geo: body.geo,
      description: body.description,
    }).run();
    return { id };
  });

  app.post("/api/channels", async (req) => {
    const body = req.body as any;
    const id = "ch_" + nanoid(12);
    // platform by key
    const plat = db.select().from(s.platforms).where(eq(s.platforms.key, body.platform_key ?? "youtube")).all()[0];
    db.insert(s.channels).values({
      id,
      brand_id: body.brand_id,
      platform_id: body.platform_id ?? plat?.id,
      name: body.name,
      handle: body.handle,
      url: body.url,
      status: body.status ?? "active",
      config: body.config ?? {},
    }).run();
    return { id };
  });

  // ---------- Videos ----------
  app.get("/api/videos", async (req) => {
    const q = req.query as any;
    const rows = await listVideos({
      niche_id: q.niche_id,
      sortBy: q.sort_by || "created_at",
      dir: q.dir || "desc",
      q: q.q,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return rows;
  });

  app.get("/api/videos/with-metrics", async (req) => {
    const q = req.query as any;
    const rows = await getVideosWithMetrics(q.niche_id);
    return rows;
  });

  // ---------- Analytics ----------
  app.get("/api/analytics", async (req) => {
    const q = req.query as any;
    const rows = await getVideosWithMetrics(q.niche_id);
    const analytics = computeAnalytics(rows);
    // persist derived analyses (optional - keep raw separate)
    return { ...analytics };
  });

  // ---------- Import ----------
  app.get("/api/import/:mode", async (req) => {
    return { ready: true };
  });

  // columns detection via POST /api/import/detect
  app.post("/api/import/detect", async (req) => {
    const body = req.body as any;
    let parsed;
    if (body.content) {
      parsed = parseImport(Buffer.from(body.content, "base64"), body.mime);
    } else if (body.headers) {
      parsed = { headers: body.headers, rows: [] };
    } else {
      parsed = { headers: [], rows: [] };
    }
    const cols = detectColumns(parsed.headers);
    return { headers: parsed.headers, columns: cols, sample: parsed.rows.slice(0, 3) };
  });

  app.post("/api/import/execute", async (req) => {
    const body = req.body as any;
    // body: { niche_id, channel_id, brand_id, headers, rows, mapping, language, source, content? mime? }
    let rows = body.rows ?? [];
    if (!rows.length && body.content) {
      const parsed = parseImport(Buffer.from(body.content, "base64"), body.mime);
      rows = parsed.rows;
    }
    const result = importVideos({
      nicheId: body.niche_id,
      channelId: body.channel_id,
      brandId: body.brand_id,
      headers: body.headers,
      rows,
      mapping: body.mapping,
      language: body.language,
      source: body.source,
    });
    return result;
  });

  // ---------- Export ----------
  app.get("/api/export", async (req, reply) => {
    const q = req.query as any;
    const format = (q.format || "csv") as "csv" | "xlsx" | "json" | "md";
    const rows = await fetchRowsForExport(q);
    const out = exportData(rows, format);
    if (format === "xlsx" && Buffer.isBuffer(out.content)) {
      reply.type(out.mime).header("Content-Disposition", `attachment; filename="export.${out.ext}"`).send(out.content);
    } else {
      reply.type(out.mime).header("Content-Disposition", `attachment; filename="export.${out.ext}"`).send(String(out.content));
    }
  });

  // ---------- Experiments ----------
  app.get("/api/experiments", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.experiments).orderBy(s.experiments.created_at).all();
    if (q.niche_id) rows = rows.filter((r) => r.niche_id === q.niche_id);
    return rows;
  });

  app.post("/api/experiments", async (req) => {
    const body = req.body as any;
    const id = "xp_" + nanoid(12);
    db.insert(s.experiments).values({
      id,
      niche_id: body.niche_id,
      channel_id: body.channel_id,
      name: body.name,
      hypothesis: body.hypothesis,
      change: body.change,
      sample_size: body.sample_size,
      expected_result: body.expected_result,
      success_metric: body.success_metric,
      status: body.status ?? "active",
    }).run();
    return { id };
  });

  app.post("/api/experiments/:id/decision", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    db.update(s.experiments)
      .set({ decision: body.decision, status: body.status ?? "completed", result_notes: body.result_notes, end_date: body.end_date })
      .where(eq(s.experiments.id, id))
      .run();
    return { ok: true };
  });

  // ---------- Ideas ----------
  app.get("/api/ideas", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.ideas).orderBy(s.ideas.viral_score).all().reverse();
    if (q.niche_id) rows = rows.filter((r) => r.niche_id === q.niche_id);
    return rows;
  });

  app.post("/api/ideas", async (req) => {
    const body = req.body as any;
    const id = "idea_" + nanoid(12);
    db.insert(s.ideas).values({
      id,
      niche_id: body.niche_id,
      title: body.title,
      topic: body.topic,
      description: body.description,
      viral_score: body.viral_score,
    }).run();
    return { id };
  });

  // ---------- Scripts ----------
  app.get("/api/scripts", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.scripts).orderBy(s.scripts.created_at).all();
    if (q.niche_id) rows = rows.filter((r) => r.niche_id === q.niche_id);
    return rows;
  });

  // Custom idea -> (optional idea record) -> existing Scriptwriter pipeline.
  // Does not duplicate Scriptwriter logic; reuse scriptwriterScript.
  app.post("/api/scripts/custom", async (req, reply) => {
    const body = req.body as any;
    const text = String(body.text ?? "").trim();
    if (text.length < 3) return reply.status(400).send({ error: "text is too short" });
    const niche_id = body.niche_id ? String(body.niche_id) : undefined;
    const title = text.split("\n")[0]?.trim().slice(0, 120) || text.slice(0, 120);
    const ideaId = "idea_" + nanoid(12);
    db.insert(s.ideas).values({
      id: ideaId,
      niche_id,
      title,
      description: text,
      source: "custom",
    }).run();
    const result = await scriptwriterScript(ideaId, niche_id);
    return { ...result, idea_id: ideaId, custom: true };
  });

  // ---------- Monetization ----------
  app.get("/api/monetization", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.monetization_opportunities).all();
    if (q.niche_id) rows = rows.filter((r) => r.niche_id === q.niche_id);
    return rows;
  });

  app.post("/api/monetization", async (req) => {
    const body = req.body as any;
    const id = "mo_" + nanoid(12);
    db.insert(s.monetization_opportunities).values({ id, ...body, verification_status: body.verification_status ?? "UNVERIFIED" }).run();
    return { id };
  });

  app.get("/api/revenue", async () => db.select().from(s.revenue).all());

  // ---------- Research ----------
  app.get("/api/research", async () => db.select().from(s.research).all());
  app.post("/api/research", async (req) => {
    const body = req.body as any;
    const id = "rs_" + nanoid(12);
    db.insert(s.research).values({ id, ...body }).run();
    return { id };
  });

  // ---------- Hooks ----------
  app.get("/api/hooks", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.hooks).all();
    if (q.niche_id) rows = rows.filter((r) => r.niche_id === q.niche_id);
    return rows;
  });

  // ---------- Agents ----------
  app.get("/api/agents", async () => db.select().from(s.agents).all());
  app.get("/api/agent-runs", async (req) => {
    const q = req.query as any;
    let rows = db.select().from(s.agent_runs).all();
    if (q.agent) rows = rows.filter((r) => r.agent_key === q.agent);
    return rows.reverse();
  });

  // ---------- Models / Providers ----------
  app.get("/api/models", async () => {
    const providers = db.select().from(s.model_providers).all();
    const models = db.select().from(s.models).all();
    const keys = db.select().from(s.api_keys).all();
    const now = Math.floor(Date.now() / 1000);
    const freeOnly = freeonly();
    return {
      policy: { free_only: freeOnly, label: freeOnly ? "FREE-TIER" : "allow-paid" },
      providers: providers.map((p) => ({
        ...p,
        usable_keys: keys.filter((k) => k.provider === p.key && k.enabled && (k.cooldown_until ?? 0) <= now).length,
        total_keys: keys.filter((k) => k.provider === p.key).length,
      })),
      models: models.map((m) => {
        const prov = providers.find((p) => p.id === m.provider_id);
        const free = prov?.kind === "local" || m.availability === "free";
        let status = "READY";
        if (!m.enabled) status = "DISABLED";
        else if (freeOnly && !free) status = "PAID_BLOCKED";
        else if ((m.cooldown_until ?? 0) > now) status = "COOLDOWN";
        else if (prov?.kind === "remote") {
          status = keys.filter((k) => k.provider === prov.key && k.enabled && (k.cooldown_until ?? 0) <= now).length > 0 ? "READY" : (keys.some((k) => k.provider === prov.key) ? "COOLDOWN" : "NOT_CONFIGURED");
        }
        return { ...m, provider_key: prov?.key, provider_name: prov?.name, free, local: prov?.kind === "local", status };
      }),
    };
  });

  app.post("/api/models", async (req) => {
    const body = req.body as any;
    db.insert(s.models).values({
      id: "mdl_" + nanoid(12),
      provider_id: body.provider_id,
      model_id: body.model_id,
      name: body.name ?? body.model_id,
      capability: body.capability,
      availability: body.availability,
    }).run();
    return { ok: true };
  });

  // Control panel: enable/disable + priority. FREE-ONLY POLICY is enforced:
  // a paid model cannot be enabled while free-only mode is active.
  app.post("/api/models/control", async (req, reply) => {
    const body = req.body as any;
    const model = db.select().from(s.models).where(eq(s.models.id, body.model_id)).all()[0];
    if (!model) return reply.status(404).send({ error: "model not found" });
    const prov = model.provider_id ? db.select().from(s.model_providers).where(eq(s.model_providers.id, model.provider_id)).all()[0] : undefined;
    const isFree = prov?.kind === "local" || model.availability === "free";
    const freeOnly = freeonly();
    if (freeOnly && !isFree && body.enabled === true) {
      return reply.status(403).send({ error: "PAID_MODEL_BLOCKED: free-only policy. Paid models не участвуют в исполнении." });
    }
    const patch: any = {};
    if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
    if (body.priority !== undefined) patch.priority = clampPriority(body.priority);
    if (body.availability !== undefined) {
      const next = String(body.availability);
      if (freeOnly && next === "paid" && body.enabled !== false) {
        return reply.status(403).send({ error: "PAID_MODEL_BLOCKED: free-only policy." });
      }
      patch.availability = next;
    }
    db.update(s.models).set(patch).where(eq(s.models.id, body.model_id)).run();
    return { ok: true, blocked: freeOnly && !isFree };
  });

  // ---------- Agent endpoints ----------
  app.post("/api/agents/analyst/analyze", async (req) => {
    const body = req.body as any;
    const result = await analystAnalyze(body.niche_id, { useAI: body.useAI });
    return result;
  });

  app.post("/api/agents/director/strategy", async (req) => {
    const body = req.body as any;
    return directorStrategy(body.niche_id, body.task);
  });

  app.post("/api/agents/scriptwriter/ideas", async (req) => {
    const body = req.body as any;
    return scriptwriterIdeas(body.niche_id, body.count ?? 10, { useAI: body.useAI ?? body.use_ai });
  });

  app.post("/api/agents/scriptwriter/script", async (req) => {
    const body = req.body as any;
    return scriptwriterScript(body.idea_id, body.niche_id);
  });

  app.post("/api/agents/monetization/plan", async (req) => {
    const body = req.body as any;
    return monetizationPlan(body.niche_id, { useAI: body.useAI });
  });

  app.post("/api/agents/orchestrate", async (req) => {
    const body = req.body as any;
    return runDirectorOrchestration(body.task, body.niche_id);
  });

  // ---------- Grids ----------
  app.get("/api/grids", async () => db.select().from(s.grids).all());
  app.post("/api/grids", async (req) => {
    const body = req.body as any;
    const id = "gr_" + nanoid(12);
    db.insert(s.grids).values({
      id,
      niche_id: body.niche_id,
      name: body.name,
      type: body.type,
      columns: body.columns ?? [],
    }).run();
    return { id };
  });
  app.get("/api/grids/:id/data", async (req) => {
    const { id } = req.params as { id: string };
    const grid = db.select().from(s.grids).where(eq(s.grids.id, id)).all()[0];
    if (!grid) throw new Error("grid not found");
    return { grid, rows: await gridRows(grid) };
  });
  app.delete("/api/grids/:id", async (req) => {
    const { id } = req.params as { id: string };
    db.delete(s.grids).where(eq(s.grids.id, id)).run();
    return { ok: true };
  });

  // ---------- Settings ----------
  app.get("/api/settings", async (req) => {
    const q = req.query as any;
    if (q.key) {
      const row = db.select().from(s.settings).where(eq(s.settings.key, q.key)).all()[0];
      return { key: q.key, value: row?.value ?? null };
    }
    return db.select().from(s.settings).all();
  });

  app.post("/api/niche-templates", async (req) => {
    const body = req.body as any;
    const { createNicheFromTemplate } = await import("../services/nicheTemplate.js");
    const res = createNicheFromTemplate({
      network_id: body.network_id,
      name: body.name,
      slug: body.slug,
      description: body.description,
      languages: body.languages ?? ["ru", "en"],
      geos: body.geos ?? [],
      taxonomy: body.taxonomy ?? [],
      content_formats: body.content_formats ?? [],
      research_sources: body.research_sources ?? [],
      audience_profile: body.audience_profile ?? {},
      monetization_categories: body.monetization_categories ?? [],
      default_grids: body.default_grids,
      is_demo: body.is_demo ?? false,
    });
    return res;
  });
}

function freeonly(): boolean {
  try {
    const row = db.select().from(s.settings).where(eq(s.settings.key, "free_only_policy")).all()[0];
    return row?.value === false ? false : true;
  } catch {
    return true;
  }
}

function clampPriority(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.max(1, Math.min(99, Math.round(v)));
}

async function gridRows(grid: any): Promise<Record<string, unknown>[]> {
  const type = grid.type;
  let rows: Record<string, unknown>[] = [];
  switch (type) {
    case "content":
      rows = await listVideos({ niche_id: grid.niche_id });
      break;
    case "ideas":
      rows = db.select().from(s.ideas).where(grid.niche_id ? eq(s.ideas.niche_id, grid.niche_id) : undefined).all() as any;
      break;
    case "experiments":
      rows = db.select().from(s.experiments).where(grid.niche_id ? eq(s.experiments.niche_id, grid.niche_id) : undefined).all() as any;
      break;
    case "monetization":
      rows = db.select().from(s.monetization_opportunities).where(grid.niche_id ? eq(s.monetization_opportunities.niche_id, grid.niche_id) : undefined).all() as any;
      break;
    case "research":
      rows = db.select().from(s.research).where(grid.niche_id ? eq(s.research.niche_id, grid.niche_id) : undefined).all() as any;
      break;
    case "analytics": {
      const v = await getVideosWithMetrics(grid.niche_id);
      const a = computeAnalytics(v);
      rows = a.topicStats;
      break;
    }
    default:
      rows = [];
  }
  return rows;
}

async function fetchRowsForExport(q: any): Promise<Record<string, unknown>[]> {
  const type = q.type || "videos";
  const niche = q.niche_id;
  if (type === "videos" || type === "content") return (await listVideos({ niche_id: niche })) as any;
  if (type === "metrics") {
    const v = await getVideosWithMetrics(niche);
    return v.map((r) => ({ ...r })) as any;
  }
  if (type === "analytics") {
    const v = await getVideosWithMetrics(niche);
    const a = computeAnalytics(v);
    return a.topicStats as any;
  }
  if (type === "ideas") return db.select().from(s.ideas).where(niche ? eq(s.ideas.niche_id, niche) : undefined).all() as any;
  if (type === "experiments") return db.select().from(s.experiments).where(niche ? eq(s.experiments.niche_id, niche) : undefined).all() as any;
  if (type === "monetization") return db.select().from(s.monetization_opportunities).where(niche ? eq(s.monetization_opportunities.niche_id, niche) : undefined).all() as any;
  if (type === "research") return db.select().from(s.research).where(niche ? eq(s.research.niche_id, niche) : undefined).all() as any;
  return [];
}

async function dbHealth() {
  try {
    db.select().from(s.settings).all();
    return "OK";
  } catch {
    return "ERROR";
  }
}

// helper to build quick seeding grid columns
export const defaultGridTemplates = {
  content: [
    { key: "title", label: "Title" },
    { key: "topic", label: "Topic" },
    { key: "views", label: "Views" },
    { key: "avg_percentage_viewed", label: "APV %" },
    { key: "published_at", label: "Published" },
  ],
  ideas: [
    { key: "title", label: "Title" },
    { key: "topic", label: "Topic" },
    { key: "viral_score", label: "Score" },
    { key: "hooks", label: "Hooks" },
  ],
};