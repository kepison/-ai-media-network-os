import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and, desc, asc, SQL, inArray } from "drizzle-orm";

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
export function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export type VideoRow = {
  id: string;
  title: string;
  topic: string | null;
  hook: string | null;
  format: string | null;
  language: string | null;
  geo: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  avg_watch_time_sec: number | null;
  avg_percentage_viewed: number | null;
  retention_0_3: number | null;
  ctr: number | null;
  rpm: number | null;
  revenue: number | null;
  channel_id: string | null;
  brand_id: string | null;
  niche_id: string | null;
};

export async function getVideosWithMetrics(nicheId?: string): Promise<VideoRow[]> {
  const where: SQL[] = [];
  if (nicheId) where.push(eq(s.videos.niche_id, nicheId));
  const videos = await db
    .select()
    .from(s.videos)
    .where(where.length ? and(...where) : undefined);
  const vids = videos.map((v) => v.id);
  const metricsRows = vids.length
    ? await db
        .select()
        .from(s.metrics)
        .where(inArray(s.metrics.video_id, vids))
    : [];

  const byVideo = new Map<string, (typeof metricsRows)[number][]>();
  metricsRows.forEach((m) => {
    const mvid = String(m.video_id);
    const arr = byVideo.get(mvid);
    if (arr) arr.push(m);
    else byVideo.set(mvid, [m]);
  });
  const getMs = (id: string) => byVideo.get(id) ?? [];

  return videos.map((v) => {
    const ms = getMs(v.id);
    const views = ms.reduce((a, m) => a + (m.views ?? 0), 0);
    const apvSum = ms.reduce((a, m) => a + (m.avg_percentage_viewed ?? 0) * (m.views ?? 0), 0);
    const weightedApv = views ? apvSum / views : null;
    const likeRate = views ? ms.reduce((a, m) => a + (m.likes ?? 0), 0) / views : null;
    const shareRate = views ? ms.reduce((a, m) => a + (m.shares ?? 0), 0) / views : null;
    const commentRate = views ? ms.reduce((a, m) => a + (m.comments ?? 0), 0) / views : null;

    return {
      id: v.id,
      title: v.title,
      topic: v.topic,
      hook: v.hook,
      format: v.format,
      language: v.language,
      geo: v.geo,
      duration_seconds: v.duration_seconds,
      published_at: v.published_at,
      views,
      likes: ms.reduce((a, m) => a + (m.likes ?? 0), 0),
      comments: ms.reduce((a, m) => a + (m.comments ?? 0), 0),
      shares: ms.reduce((a, m) => a + (m.shares ?? 0), 0),
      saves: ms.reduce((a, m) => a + (m.saves ?? 0), 0),
      followers_gained: ms.reduce((a, m) => a + (m.followers_gained ?? 0), 0),
      avg_watch_time_sec: ms.reduce((a, m) => a + (m.avg_watch_time_sec ?? 0), 0),
      avg_percentage_viewed: weightedApv,
      retention_0_3: ms.length ? Math.max(...ms.map((m) => m.retention_0_3 ?? 0)) : null,
      ctr: ms.length ? mean(ms.map((m) => m.ctr ?? 0)) : null,
      rpm: ms.length ? mean(ms.map((m) => m.rpm ?? 0)) : null,
      revenue: ms.reduce((a, m) => a + (m.revenue ?? 0), 0),
      channel_id: v.channel_id,
      brand_id: v.brand_id,
      niche_id: v.niche_id,
      likes_rate: likeRate,
      shares_rate: shareRate,
      comments_rate: commentRate,
    } as VideoRow as any;
  });
}

// ---------- Row listing (for grids + import preview) ----------

export async function listVideos(opts: {
  niche_id?: string;
  sortBy?: string;
  dir?: string;
  q?: string;
  limit?: number;
}) {
  let qb: any = db.select().from(s.videos);
  const where: SQL[] = [];
  if (opts.niche_id) where.push(eq(s.videos.niche_id, opts.niche_id));
  if (where.length) qb = qb.where(and(...where));
  const col = (s.videos as any)[opts.sortBy || "created_at"];
  if (col) qb = qb.orderBy(opts.dir === "asc" ? asc(col) : desc(col));
  if (opts.limit) qb = qb.limit(opts.limit);
  let rows = await qb;
  if (opts.q) {
    rows = rows.filter(
      (r: any) =>
        r.title.toLowerCase().includes(opts.q!.toLowerCase()) ||
        (r.topic ?? "").toLowerCase().includes(opts.q!.toLowerCase())
    );
  }
  return rows;
}

export async function listMetrics(opts: { video_ids?: string[] }) {
  let qb: any = db.select().from(s.metrics);
  if (opts.video_ids?.length) qb = qb.where(and(...opts.video_ids.map((id) => eq(s.metrics.video_id, id))));
  return qb;
}