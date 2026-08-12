import { getVideosWithMetrics, median, mean, VideoRow } from "./data.js";

export type Evidence = {
  claim: string;
  evidence: string;
  sample_size: number;
  confidence: "low" | "medium" | "high";
  correlationOnly?: boolean;
};

const LOW = 5;
const MED = 15;

function conf(n: number): "low" | "medium" | "high" {
  if (n < LOW) return "low";
  if (n < MED) return "medium";
  return "high";
}

export function computeAnalytics(rows: VideoRow[]) {
  if (!rows.length) return empty();
  const views = rows.map((r) => r.views);
  const avgViews = mean(views);
  const medianViews = median(views);
  const avgApv = mean(rows.filter((r) => r.avg_percentage_viewed != null).map((r) => r.avg_percentage_viewed as number));
  const medianApv = median(rows.filter((r) => r.avg_percentage_viewed != null).map((r) => r.avg_percentage_viewed as number));
  const avgLikesRate = mean(rows.map((r) => (r as any).likes_rate ?? 0));
  const avgShareRate = mean(rows.map((r) => (r as any).shares_rate ?? 0));
  const avgCommentRate = mean(rows.map((r) => (r as any).comments_rate ?? 0));

  // winners / losers
  const sorted = [...rows].sort((a, b) => b.views - a.views);
  const top = Math.max(3, Math.min(5, Math.ceil(rows.length * 0.1)));
  const winners = sorted.slice(0, top);
  const losers = [...sorted].slice(-Math.max(3, Math.min(5, Math.ceil(rows.length * 0.1)))).reverse();

  // topic performance
  const byTopic = groupBy(rows, (r) => r.topic ?? "OTHER");
  const topicStats = Object.entries(byTopic)
    .map(([topic, list]) => ({
      topic,
      n: list.length,
      avg: Math.round(mean(list.map((r) => r.views))),
      med: Math.round(median(list.map((r) => r.views))),
      vsMedian: median(list.map((r) => r.views)) / (medianViews || 1) - 1,
      apvMed: median(list.filter((r) => r.avg_percentage_viewed != null).map((r) => r.avg_percentage_viewed as number)) ?? 0,
    }))
    .sort((a, b) => b.med - a.med);

  // hook type performance
  const byHookType = groupBy(rows, (r) => guessHookType(r.hook));
  const hookStats = Object.entries(byHookType)
    .map(([type, list]) => ({
      type,
      n: list.length,
      med: Math.round(median(list.map((r) => r.views))) || 0,
      avgApv: mean(list.filter((r) => r.avg_percentage_viewed != null).map((r) => r.avg_percentage_viewed as number)) ?? 0,
    }))
    .sort((a, b) => b.med - a.med);

  // format
  const byFormat = groupBy(rows, (r) => r.format ?? "other");
  const formatStats = Object.entries(byFormat)
    .map(([format, list]) => ({
      format,
      n: list.length,
      med: Math.round(median(list.map((r) => r.views))),
      apvMed: median(list.filter((r) => r.avg_percentage_viewed != null).map((r) => r.avg_percentage_viewed as number)) ?? 0,
    }))
    .sort((a, b) => b.med - a.med);

  // language
  const byLang = groupBy(rows, (r) => r.language ?? "?");
  const langStats = Object.entries(byLang)
    .map(([lang, list]) => ({ lang, n: list.length, med: Math.round(median(list.map((r) => r.views))), avg: Math.round(mean(list.map((r) => r.views))) }))
    .sort((a, b) => b.med - a.med);

  const findings: Evidence[] = [];
  const decisions: { decision: string; target: string; evidence: Evidence; reason: string; next_action: string }[] = [];

  // 1. Topic outperformers (above median, enough sample)
  const aboveMedian = topicStats.filter((t) => t.n >= 3 && t.vsMedian > 0.3);
  if (aboveMedian.length) {
    const best = aboveMedian[0];
    findings.push({
      claim: `Topic "${best.topic}" outperforms niche median`,
      evidence: `${best.n} videos, median ${best.med} views vs niche median ${Math.round(medianViews)} (+${Math.round(best.vsMedian * 100)}%)`,
      sample_size: best.n,
      confidence: conf(best.n),
      correlationOnly: true,
    });
    decisions.push({
      decision: "SCALE",
      target: `topic:${best.topic}`,
      evidence: {
        claim: `Topic "${best.topic}" outperforms median`,
        evidence: `median views ${best.med} (n=${best.n}) vs niche median ${Math.round(medianViews)}`,
        sample_size: best.n,
        confidence: conf(best.n),
      },
      reason: "Стабильно выше медианы по нише",
      next_action: `Запустить 3 новых видео в теме "${best.topic}"`,
    });
  }

  // 2. Below-median topics: KILL or TEST
  const belowMedian = topicStats.filter((t) => t.n >= 3 && t.vsMedian < -0.3);
  if (belowMedian.length) {
    const worst = belowMedian[belowMedian.length - 1];
    findings.push({
      claim: `Topic "${worst.topic}" underperforms niche median`,
      evidence: `${worst.n} videos, median ${worst.med} vs niche median ${Math.round(medianViews)} (${Math.round(worst.vsMedian * 100)}%)`,
      sample_size: worst.n,
      confidence: conf(worst.n),
      correlationOnly: true,
    });
    decisions.push({
      decision: worst.n >= MED ? "KILL" : "TEST",
      target: `topic:${worst.topic}`,
      evidence: {
        claim: `Topic "${worst.topic}" underperforms`,
        evidence: `median ${worst.med} (n=${worst.n})`,
        sample_size: worst.n,
        confidence: conf(worst.n),
      },
      reason: worst.n >= MED ? "Достаточно данных: формат не работает" : "Мало данных: сначала тест, потом вывод",
      next_action: worst.n >= MED ? `Прекратить тему "${worst.topic}"` : `Протестировать ещё 3 видео в "${worst.topic}" с новым подходом`,
    });
  }

  // 3. Hook performance
  if (hookStats.some((h) => h.n >= 3)) {
    const bestHook = hookStats.find((h) => h.n >= 3);
    const worstHook = [...hookStats].reverse().find((h) => h.n >= 3);
    if (bestHook && bestHook.med > medianViews * 1.2) {
      findings.push({
        claim: `Hook type "${bestHook.type}" drives higher reach`,
        evidence: `${bestHook.n} videos, median ${bestHook.med} views (niche median ${Math.round(medianViews)})`,
        sample_size: bestHook.n,
        confidence: conf(bestHook.n),
        correlationOnly: true,
      });
      decisions.push({
        decision: "SCALE",
        target: `hook:${bestHook.type}`,
        evidence: { claim: `hooks "${bestHook.type}"`, evidence: `median ${bestHook.med} (n=${bestHook.n})`, sample_size: bestHook.n, confidence: conf(bestHook.n) },
        reason: "Такой тип хуков даёт лучший охват",
        next_action: `Использовать больше хуков типа "${bestHook.type}"`,
      });
    }
    if (worstHook && worstHook.med < medianViews * 0.6) {
      findings.push({
        claim: `Hook type "${worstHook.type}" underperforms`,
        evidence: `${worstHook.n} videos, median ${worstHook.med} views`,
        sample_size: worstHook.n,
        confidence: conf(worstHook.n),
        correlationOnly: true,
      });
    }
  }

  // 4. Retention observation (event-driven growth vs retention)
  const lowApvViral = rows.filter((r) => r.views > medianViews * 3 && (r.avg_percentage_viewed ?? 0) < 40);
  if (lowApvViral.length) {
    findings.push({
      claim: "High-view videos with low retention suggest external/event-driven reach, not organic retention",
      evidence: `${lowApvViral.length} videos with views > 3x median but avg percentage viewed < 40%. Correlation, not causation of format.`,
      sample_size: lowApvViral.length,
      confidence: conf(lowApvViral.length),
      correlationOnly: true,
    });
  }

  // 5. Strong repeated pattern check
  const repeatedTopics = topicStats.filter((t) => t.n >= MED && t.vsMedian > 0.5);
  if (repeatedTopics.length) {
    findings.push({
      claim: `Pattern: "${repeatedTopics[0].topic}" consistently outperforms (n>=${MED})`,
      evidence: `${repeatedTopics[0].n} videos, median +${Math.round(repeatedTopics[0].vsMedian * 100)}% vs niche median`,
      sample_size: repeatedTopics[0].n,
      confidence: repeatedTopics[0].n >= 30 ? "high" : "medium",
    });
  }

  return {
    rows_count: rows.length,
    avgViews: Math.round(avgViews),
    medianViews: Math.round(medianViews),
    avgApv: Math.round(avgApv * 10) / 10,
    medianApv: Math.round(medianApv * 10) / 10,
    avgLikesRate: Math.round(avgLikesRate * 100) / 100,
    avgShareRate: Math.round(avgShareRate * 100) / 100,
    avgCommentRate: Math.round(avgCommentRate * 100) / 100,
    winners: winners.map((r) => ({ id: r.id, title: r.title, topic: r.topic, views: r.views, apv: r.avg_percentage_viewed, hook: r.hook })),
    losers: losers.map((r) => ({ id: r.id, title: r.title, topic: r.topic, views: r.views, apv: r.avg_percentage_viewed, hook: r.hook })),
    topicStats,
    hookStats,
    formatStats,
    langStats,
    findings,
    decisions,
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = key(r);
    (out[k] ??= []).push(r);
  }
  return out;
}

function guessHookType(hook: string | null): string {
  if (!hook) return "other";
  const h = hook.toLowerCase();
  if (/(\$|rub|тыс|price|expensive|миллион|доллар|сколько|cost)/.test(h)) return "MONEY";
  if (/(почему|why|что будет|куда|зачем)/.test(h)) return "QUESTION";
  if (/(\?)$/.test(h)) return "QUESTION";
  if (/(никто|никогда|не знал|не знают|молчат|hidden|secret)/.test(h)) return "MYSTERY";
  if (/(лучший|рекорд|самый|великий|долларов|миллион)/.test(h)) return "BIG-CLAIM";
  if (/(финал|потерял|проиграл|скандал|сняли|удалили|случилось|а потом)/.test(h)) return "SHOCK/STORY";
  return "OTHER";
}

function empty() {
  return {
    rows_count: 0,
    avgViews: 0,
    medianViews: 0,
    avgApv: 0,
    medianApv: 0,
    avgLikesRate: 0,
    avgShareRate: 0,
    avgCommentRate: 0,
    winners: [],
    losers: [],
    topicStats: [],
    hookStats: [],
    formatStats: [],
    langStats: [],
    findings: [],
    decisions: [],
  };
}