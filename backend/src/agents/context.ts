import { computeAnalytics } from "../services/analytics.js";
import { getVideosWithMetrics } from "../services/data.js";
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq } from "drizzle-orm";

// Aggregated context builders — never dump raw datasets to the model.

export async function buildAnalystContext(nicheId?: string, opts: { limit?: number } = {}) {
  const rows = await getVideosWithMetrics(nicheId);
  const analytics = computeAnalytics(rows);
  const top = [...rows].sort((a, b) => b.views - a.views).slice(0, opts.limit ?? 15);
  const bottom = [...rows].sort((a, b) => a.views - b.views).slice(0, opts.limit ?? 8);

  return `
NICHE ANALYTICS SUMMARY
- videos analyzed: ${analytics.rows_count}
- avg views: ${analytics.avgViews}, median views: ${analytics.medianViews}
- avg percentage viewed: ${analytics.avgApv}%, median: ${analytics.medianApv}%
- like rate avg: ${analytics.avgLikesRate}%, share rate avg: ${analytics.avgShareRate}%, comment rate avg: ${analytics.avgCommentRate}%

TOP PERFORMERS (raw):
${top.map((r) => `- [${r.topic ?? "?"}] "${r.title}" views=${r.views} apv=${r.avg_percentage_viewed}% format=${r.format} lang=${r.language}`).join("\n")}

LOWEST PERFORMERS (raw):
${bottom.map((r) => `- [${r.topic ?? "?"}] "${r.title}" views=${r.views} apv=${r.avg_percentage_viewed}%`).join("\n")}

TOPIC BREAKDOWN (median views per topic):
${analytics.topicStats.map((t) => `- ${t.topic}: n=${t.n} median=${t.med} vs_niche_median=${Math.round(t.vsMedian * 100)}% apv=${Math.round(t.apvMed)}%`).join("\n")}

HOOK TYPE BREAKDOWN:
${analytics.hookStats.map((h) => `- ${h.type}: n=${h.n} median=${h.med}`).join("\n")}

FORMAT BREAKDOWN:
${analytics.formatStats.map((f) => `- ${f.format}: n=${f.n} median=${f.med} apv=${Math.round(f.apvMed)}%`).join("\n")}

Note: received views can come from big events (majors, transfers, scandals). Never attribute causality to format solely based on one viral video. Separate correlation from causation.
`;
}

export async function buildDirectorContext(nicheId?: string) {
  const rows = await getVideosWithMetrics(nicheId);
  const analytics = computeAnalytics(rows);

  const [networks, niches, channels, exps, revenue, agentRuns, tasks] = await Promise.all([
    db.select().from(s.networks).all(),
    db.select().from(s.niches).all(),
    db.select().from(s.channels).all(),
    db.select().from(s.experiments).all(),
    db.select().from(s.revenue).all(),
    db.select().from(s.agent_runs).all(),
    db.select().from(s.tasks).all(),
  ]);

  const totalViews = rows.reduce((a, r) => a + r.views, 0);
  const totalRevenue = revenue.reduce((a, r) => a + r.amount, 0);
  const aiCost = agentRuns.reduce((a, r) => a + (r.cost ?? 0), 0);

  return `
NETWORK COMMAND CENTER SUMMARY
- networks: ${networks.length}, niches: ${niches.map((n) => n.name).join(", ") || "none"}, channels: ${channels.length}
- total videos: ${rows.length}, total views: ${totalViews}, median views: ${analytics.medianViews}
- total revenue (logged): ${totalRevenue} USD, total AI cost: ${aiCost.toFixed(4)} USD
- open tasks: ${tasks.filter((t) => t.status === "open").length}
- experiments: ${exps.map((e) => `${e.name} (${e.status})`).join(", ") || "none"}

WINNERS TOP 5:
${analytics.winners.slice(0, 5).map((w) => `- [${w.topic}] "${w.title}" views=${w.views} apv=${w.apv}%`).join("\n")}

LOSERS BOTTOM 5:
${analytics.losers.slice(0, 5).map((l) => `- [${l.topic}] "${l.title}" views=${l.views}`).join("\n")}

AUTO-FINDINGS:
${analytics.findings.map((f) => `- CLAIM: ${f.claim} | EVIDENCE: ${f.evidence} | n=${f.sample_size} conf=${f.confidence}`).join("\n")}

AUTO-DECISIONS:
${analytics.decisions.map((d) => `- DECISION: ${d.decision} on ${d.target} | WHY: ${d.reason} | NEXT: ${d.next_action}`).join("\n")}

Recent AI agent runs: ${agentRuns.slice(-5).map((r) => `${r.agent_key}:${r.status}`).join(", ") || "none"}
`;
}

export async function buildScriptwriterContext(nicheId?: string) {
  const rows = await getVideosWithMetrics(nicheId);
  const analytics = computeAnalytics(rows);
  const bestTopics = analytics.topicStats.filter((t) => t.n >= 2).slice(0, 5);
  const bestHooks = analytics.hookStats.filter((h) => h.n >= 2).slice(0, 4);

  // winning videos for reference
  const winners = rows
    .filter((r) => r.views >= analytics.medianViews * 1.5)
    .slice(0, 6);

  return `
CONTENT INTELLIGENCE (from real analytics)
- niche median views: ${analytics.medianViews}
- best topics (median, n>=2): ${bestTopics.map((t) => `${t.topic} (n=${t.n}, med=${t.med}, +${Math.round(t.vsMedian * 100)}%)`).join(", ") || "insufficient data"}
- best hook types (median, n>=2): ${bestHooks.map((h) => `${h.type} (n=${h.n}, med=${h.med})`).join(", ") || "insufficient data"}

REFERENCE WINNERS:
${winners.map((w) => `- [${w.topic}] hook="${w.hook}" apv=${w.avg_percentage_viewed}% views=${w.views}`).join("\n")}

Working rule: base ideas on the intelligence above; every score must be defensible with evidence; if no evidence, mark hypothesis.
`;
}

export async function buildMonetizationContext(nicheId?: string) {
  const rows = await getVideosWithMetrics(nicheId);
  const channels = await db.select().from(s.channels).all();
  const followers = rows.reduce((a, r) => a + (r.followers_gained ?? 0), 0);
  const totalViews = rows.reduce((a, r) => a + r.views, 0);
  const monthlyViews = Math.round(totalViews / 3); // demo videos span ~90 days
  const opps = await db.select().from(s.monetization_opportunities).all();

  return `
AUDIENCE NETWORK PROFILE
- demo channels: ${channels.length}
- demo follower growth (90d): ${followers}
- estimated monthly views: ${monthlyViews} (based on 90-day demo window)
- revenue ladder context: current level ~ estimated "1k-5k monthly views"

KNOWN MONETIZATION OPPORTUNITIES (verification status shown):
${opps.map((o) => `- ${o.company} (${o.program_type}, ${o.verification_status}) ${o.commission ? `comm: ${o.commission}` : ""}`).join("\n") || "none logged"}

Rules: never invent rates, requirements, contacts. Mark UNVERIFIED. Do not recommend scams/banned practices.
`;
}

export async function getNicheBrief(nicheId: string) {
  const n = db.select().from(s.niches).where(eq(s.niches.id, nicheId)).all()[0];
  if (!n) return null;
  return {
    name: n.name,
    languages: n.languages,
    taxonomy: n.taxonomy,
    formats: n.content_formats,
    audience: n.audience_profile,
    monetization_categories: n.monetization_categories,
  };
}