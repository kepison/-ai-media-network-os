// Acceptance test suite — запускает сервер (или использует запущенный) и проверяет сквозной флоу.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 4139; // отдельный порт для тестов
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => boolean | Promise<boolean>, extra?: string) {
  return Promise.resolve()
    .then(fn)
    .then((ok) => {
      if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
      } else {
        failed++;
        failures.push(name);
        console.log(`  \x1b[31mFAIL\x1b[0m ${name}${extra ? ` — ${extra}` : ""}`);
      }
    })
    .catch((e) => {
      failed++;
      failures.push(name);
      console.log(`  \x1b[31mFAIL\x1b[0m ${name} — ${(e as Error).message}`);
    });
}

async function get(path: string): Promise<any> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
async function post(path: string, body?: unknown): Promise<any> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`POST ${path} -> ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}
async function del(path: string) {
  const r = await fetch(BASE + path, { method: "DELETE" });
  return r.ok;
}

async function waitHttp(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log("=== AI MEDIA NETWORK OS — Acceptance Test ===");

  // use separate DB
  process.env.PORT = String(PORT);
  process.env.DB_PATH = path.join(ROOT, "..", "data", "test.db");

  const server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: process.env.DB_PATH, PORT: String(PORT) },
    stdio: "ignore",
  });

  const up = await waitHttp();
  if (!up) {
    console.log("\x1b[31mFAIL: сервер не поднялся\x1b[0m");
    server.kill();
    process.exit(1);
  }

  let nicheId = "";
  let ideaId = "";
  let expId = "";
  let channelId = "";

  await test("health: backend + db", async () => {
    const h = await get("/api/health");
    return h.modules?.backend === "OK" && h.modules?.database === "OK";
  });

  await test("health: ollama provider OK", async () => {
    const h = await get("/api/health");
    const oll = h.providers?.find((p: any) => p.key === "ollama");
    return oll?.status === "OK";
  });

  await test("tree: CS2 niche exists (demo)", async () => {
    const t = await get("/api/tree");
    const cs2 = t.niches?.find((n: any) => n.slug === "cs2");
    if (!cs2) return false;
    nicheId = cs2.id;
    return cs2.is_demo === true;
  });

  await test("content: 100 demo videos", async () => {
    const v = await get(`/api/videos/with-metrics?niche_id=${nicheId}`);
    return v.length === 100;
  });

  await test("analytics: avg+median > 0, winners found", async () => {
    const a = await get(`/api/analytics?niche_id=${nicheId}`);
    return a.medianViews > 0 && a.winners.length >= 3;
  });

  await test("analytics: evidence findings present", async () => {
    const a = await get(`/api/analytics?niche_id=${nicheId}`);
    return a.findings.length > 0 && a.decisions.length > 0;
  });

  await test("analyst agent (deterministic)", async () => {
    const r = await post("/api/agents/analyst/analyze", { niche_id: nicheId, useAI: false });
    return r.analytics?.rows_count > 0;
  });

  await test("grids: default grids exist", async () => {
    const g = await get("/api/grids");
    return g.length >= 3;
  });

  await test("grids: content grid has rows", async () => {
    const grids = await get("/api/grids");
    const content = grids.find((g: any) => g.type === "content");
    if (!content) return false;
    const d = await get(`/api/grids/${content.id}/data`);
    return d.rows?.length >= 10;
  });

  await test("experiments: demo experiment exists", async () => {
    const e = await get(`/api/experiments?niche_id=${nicheId}`);
    return e.length > 0;
  });

  await test("experiments: create + decision", async () => {
    const e = await post("/api/experiments", {
      niche_id: nicheId,
      name: "test hook length",
      hypothesis: "shorter hooks increase retention",
      change: "hooks <= 8 words",
      sample_size: 5,
      success_metric: "retention_0_3",
    });
    expId = e.id;
    await post(`/api/experiments/${e.id}/decision`, { decision: "KEEP" });
    const upd = await get(`/api/experiments?niche_id=${nicheId}`);
    const found = upd.find((x: any) => x.id === e.id);
    return found?.decision === "KEEP";
  });

  await test("ideas: scriptwriter generate 5 (deterministic)", async () => {
    const r = await post("/api/agents/scriptwriter/ideas", { niche_id: nicheId, count: 5, useAI: false });
    ideaId = r.ideas?.[0]?.id || "";
    return r.ideas?.length >= 3;
  });

  await test("import: detect columns mapping", async () => {
    const r = await post("/api/import/detect", {
      headers: ["title", "views", "просмотры", "likes", "topic", "date"],
    });
    const col = r.columns?.find((c: any) => c.original === "просмотры");
    return col?.mappedTo === "views";
  });

  await test("import: execute CSV rows", async () => {
    const rows = [
      { title: "imp video 1", views: "100", likes: "5", topic: "players", date: "2026-08-01" },
      { title: "imp video 2", views: "200", likes: "10", topic: "skins", date: "2026-08-02" },
    ];
    const r = await post("/api/import/execute", {
      niche_id: nicheId,
      headers: ["title", "views", "likes", "topic", "date"],
      rows,
      mapping: { title: "title", views: "views", likes: "likes", topic: "topic", date: "published_at" },
      source: "test",
    });
    return r.inserted === 2;
  });

  await test("channel: create channel", async () => {
    const t = await get("/api/tree");
    const brand = t.brands?.find((b: any) => b.niche_id === nicheId);
    const c = await post("/api/channels", { brand_id: brand.id, name: "Test channel", platform_key: "youtube" });
    channelId = c.id;
    return Boolean(c.id);
  });

  await test("niche-templates: create second niche MMA", async () => {
    const r = await post("/api/niche-templates", {
      name: "MMA Test",
      slug: "mma-test",
      taxonomy: ["FIGHTERS", "KO", "MONEY"],
      languages: ["ru", "en"],
      content_formats: [],
      default_grids: [{ name: "MMA Content", type: "content", columns: [] }],
    });
    return Boolean(r.id);
  });

  await test("multi-niche: CS2 still intact after MMA", async () => {
    const t = await get("/api/tree");
    const cs2 = t.niches?.find((n: any) => n.slug === "cs2");
    const mma = t.niches?.find((n: any) => n.slug === "mma-test");
    if (!cs2 || !mma) return false;
    const v = await get(`/api/videos/with-metrics?niche_id=${cs2.id}`);
    return v.length >= 100 && mma.id !== cs2.id;
  });

  await test("export: csv analytics", async () => {
    const r = await fetch(`${BASE}/api/export?type=analytics&niche_id=${nicheId}&format=csv`);
    const txt = await r.text();
    return r.status === 200 && txt.includes("topic");
  });

  await test("export: xlsx videos", async () => {
    const r = await fetch(`${BASE}/api/export?type=videos&niche_id=${nicheId}&format=xlsx`);
    const buf = Buffer.from(await r.arrayBuffer());
    return r.status === 200 && buf.length > 500;
  });

  await test("revenue: present", async () => {
    const r = await get("/api/revenue");
    return Array.isArray(r);
  });

  await test("models: providers + models configured", async () => {
    const m = await get("/api/models");
    return m.providers?.length >= 2 && m.models?.length >= 4;
  });

  console.log(`\n=== ИТОГО: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("\nПровалены:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});