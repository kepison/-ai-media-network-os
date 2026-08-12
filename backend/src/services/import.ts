import * as XLSX from "xlsx";
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { nanoid } from "nanoid";

// ---------- Import ----------

export const COLUMN_ALIASES: Record<string, string[]> = {
  title: ["title", "название", "name", "video title"],
  views: ["views", "view", "просмотры", "просмотров", "video views", "views count"],
  likes: ["likes", "лайки", "likes count"],
  comments: ["comments", "комментарии", "comments count"],
  shares: ["shares", "репосты", "share", "shares count"],
  saves: ["saves", "сохранения", "bookmarks"],
  followers_gained: ["followers gained", "new followers", "подписчики", "followers", "followers gained"],
  topic: ["topic", "тема", "category", "category"],
  hook: ["hook", "хук", "hook text"],
  duration_seconds: ["duration", "длительность", "duration seconds", "length", "duration (s)", "длительность (сек)"],
  published_at: ["date", "дата", "published date", "publish date", "published"],
  retention_0_3: ["retention 0-3", "retention", "первых 3 сек", "first 3s retention", "retention_0_3s"],
  avg_percentage_viewed: ["avg percentage viewed", "average percentage viewed", "avg % viewed", "средний % просмотра", "apv"],
  ctr: ["ctr", "ctr %", "click through rate"],
  language: ["language", "язык"],
  platform: ["platform", "платформа"],
  format: ["format", "формат"],
  external_id: ["video id", "id", "video_id", "video url id"],
  url: ["url", "link", "ссылка"],
};

export function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(key) || aliases.includes(h.trim().toLowerCase())) return canonical;
  }
  return h.trim();
}

export function detectColumns(headers: string[]): { key: string; original: string; mappedTo: string | null; suggested: string }[] {
  return headers.map((h) => {
    const mapped = normalizeHeader(h);
    const validKeys = Object.keys(COLUMN_ALIASES);
    return {
      key: mapped,
      original: h,
      mappedTo: validKeys.includes(mapped) ? mapped : null,
      suggested: mapped,
    };
  });
}

export function parseImport(content: string | Buffer, mime = "text/csv"): { headers: string[]; rows: Record<string, unknown>[] } {
  let wb: XLSX.WorkBook;
  if (Buffer.isBuffer(content) || mime.includes("excel") || mime.includes("spreadsheet") || mime.includes("xlsx")) {
    wb = XLSX.read(content, { type: Buffer.isBuffer(content) ? "buffer" : "array" });
  } else {
    wb = XLSX.read(String(content), { type: "string" });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) return { headers: [], rows: [] };
  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

export function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function importVideos(opts: {
  nicheId?: string;
  channelId?: string;
  brandId?: string;
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: Record<string, string>; // originalHeader -> canonical field
  language?: string;
  source?: string;
}): { inserted: number; skipped: number; errors: string[] } {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // reversed mapping: original header -> target field
  for (let idx = 0; idx < opts.rows.length; idx++) {
    const raw = opts.rows[idx];
    try {
      // build field map
      const f: Record<string, unknown> = {};
      for (const [header, field] of Object.entries(opts.mapping)) {
        const val = raw[header];
        if (val === undefined) continue;
        f[field] = val;
      }
      const title = String(f.title ?? "").trim();
      if (!title) {
        skipped++;
        continue;
      }
      const vid = "vd_" + nanoid(12);
      const pubDate = String(f.published_at ?? "").trim();
      db.insert(s.videos).values({
        id: vid,
        channel_id: opts.channelId,
        brand_id: opts.brandId,
        niche_id: opts.nicheId,
        title,
        topic: f.topic ? String(f.topic) : null,
        hook: f.hook ? String(f.hook) : null,
        language: f.language ? String(f.language) : opts.language ?? null,
        format: f.format ? String(f.format) : null,
        url: f.url ? String(f.url) : null,
        external_id: f.external_id ? String(f.external_id) : null,
        duration_seconds: toNumber(f.duration_seconds),
        published_at: pubDate || null,
        source: opts.source ?? "import",
        status: "published",
      }).run();

      db.insert(s.metrics).values({
        id: "mt_" + nanoid(12),
        video_id: vid,
        date: pubDate || new Date().toISOString().slice(0, 10),
        views: toNumber(f.views) ?? 0,
        likes: toNumber(f.likes) ?? 0,
        comments: toNumber(f.comments) ?? 0,
        shares: toNumber(f.shares) ?? 0,
        saves: toNumber(f.saves) ?? 0,
        followers_gained: toNumber(f.followers_gained) ?? 0,
        avg_percentage_viewed: toNumber(f.avg_percentage_viewed),
        retention_0_3: toNumber(f.retention_0_3),
        ctr: toNumber(f.ctr),
        source: opts.source ?? "import",
      }).run();
      inserted++;
    } catch (e) {
      errors.push(`Row ${idx + 1}: ${(e as Error).message}`);
      skipped++;
    }
  }
  return { inserted, skipped, errors };
}

// ---------- Export ----------

function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) => {
    const str = v == null ? "" : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = cols.map((c) => esc(c)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r?.[c])).join(",")).join("\n");
  return head + "\n" + body;
}

export function exportData(rows: Record<string, unknown>[], format: "csv" | "xlsx" | "json" | "md", columns?: string[]) {
  switch (format) {
    case "csv":
      return { content: toCSV(rows, columns), mime: "text/csv", ext: "csv" };
    case "json":
      return { content: JSON.stringify(rows, null, 2), mime: "application/json", ext: "json" };
    case "md": {
      const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
      const head = "| " + cols.join(" | ") + " |\n| " + cols.map(() => "---").join(" | ") + " |\n";
      const body = rows.map((r) => "| " + cols.map((c) => String(r?.[c] ?? "")).join(" | ") + " |").join("\n");
      return { content: head + body, mime: "text/markdown", ext: "md" };
    }
    case "xlsx": {
      const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      void cols;
      return { content: buf, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
    }
  }
}