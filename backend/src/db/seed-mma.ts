import { db } from "./client.js";
import * as s from "./schema.js";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createNicheFromTemplate, ensurePlatforms } from "../services/nicheTemplate.js";
import { run as migrate } from "./migrate.js";

// Demo второй ниши: MMA. Доказывает, что система многонишевая и CS2 не ломается.

function id(p: string) {
  return `${p}_${nanoid(12)}`;
}

export async function seedMma(force = false) {
  migrate();
  ensurePlatforms();

  const existing = db.select().from(s.niches).where(eq(s.niches.name, "MMA")).all();
  if (existing.length > 0 && !force) {
    console.log("[seed-mma] ниша MMA уже есть, skip");
    return { seeded: false };
  }
  if (force) {
    for (const n of existing) db.delete(s.niches).where(eq(s.niches.id, n.id)).run();
  }

  const net = db.select().from(s.networks).all()[0];
  const res = createNicheFromTemplate({
    network_id: net?.id,
    name: "MMA",
    slug: "mma",
    description: "Mixed martial arts / UFC content niche (demo)",
    languages: ["ru", "en"],
    geos: ["Global", "CIS"],
    taxonomy: ["FIGHTERS", "KO", "DRAMA", "TRAINING", "MONEY", "RECORDS", "CONTROVERSY", "HISTORY", "NEWS", "OTHER"],
    content_formats: [
      { key: "shorts", name: "Short vertical", duration: 30, platform: "youtube" },
      { key: "tiktok", name: "TikTok vertical", duration: 20, platform: "tiktok" },
      { key: "reels", name: "Instagram Reels", duration: 25, platform: "instagram" },
    ],
    research_sources: [
      { name: "UFC.com", url: "https://www.ufc.com", type: "official" },
      { name: "Sherdog", url: "https://www.sherdog.com", type: "stats" },
      { name: "MMAFighting", url: "https://www.mmafighting.com", type: "news" },
      { name: "Reddit r/MMA", url: "https://reddit.com/r/MMA", type: "community" },
    ],
    audience_profile: {
      segments: [
        { name: "fight fans", age: "18-40", interests: ["UFC", "KOs", "fighters"] },
        { name: "betting followers", age: "20-45", interests: ["odds", "predictions"] },
      ],
    },
    monetization_categories: ["ads", "affiliate", "sponsors"],
    is_demo: true,
  });

  // demo brand + channels
  const brandId = id("br");
  db.insert(s.brands).values({ id: brandId, niche_id: res.id, name: "MMA RU", language: "ru", geo: "CIS" }).run();
  const plats = db.select().from(s.platforms).all();
  const byKey = new Map(plats.map((p) => [p.key, p]));
  for (const [pkey, name] of [["youtube", "MMA RU YouTube"], ["tiktok", "MMA RU TikTok"]] as const) {
    db.insert(s.channels).values({
      id: id("ch"),
      brand_id: brandId,
      platform_id: byKey.get(pkey)?.id,
      name,
      status: "active",
      config: { format: pkey },
    }).run();
  }

  // demo videos (small set, to prove niche isolation)
  const rng = mulberry32(77);
  const demoTitles = [
    "Лучший нокаут года: разбор",
    "Почему Хабиб ушёл непобеждённым",
    "Сколько реально зарабатывает UFC-боец",
    "Самая громкая драка в истории UFC",
    "Почему этот бой был остановлен рано",
    "5 фактов о Коноре, которые вы не знали",
  ];
  const channels = db
    .select()
    .from(s.channels)
    .where(eq(s.channels.brand_id, brandId))
    .all();
  for (let i = 0; i < 12; i++) {
    const ch = channels[Math.floor(rng() * channels.length)];
    const views = 3000 + Math.floor(rng() * 30000);
    const title = demoTitles[i % demoTitles.length];
    const vid = id("vd");
    db.insert(s.videos).values({
      id: vid,
      channel_id: ch.id,
      brand_id: brandId,
      niche_id: res.id,
      title,
      topic: ["FIGHTERS", "KO", "MONEY", "DRAMA"][i % 4],
      format: i % 2 ? "shorts" : "tiktok",
      language: "ru",
      status: "published",
      published_at: new Date(Date.now() - i * 5 * 86400000).toISOString(),
      source: "demo",
      is_demo: true,
    }).run();
    db.insert(s.metrics).values({
      id: id("mt"),
      video_id: vid,
      date: new Date(Date.now() - i * 5 * 86400000).toISOString().slice(0, 10),
      views,
      likes: Math.floor(views * 0.04),
      comments: Math.floor(views * 0.008),
      shares: Math.floor(views * 0.005),
      avg_percentage_viewed: 35 + rng() * 30,
      retention_0_3: 60 + rng() * 30,
      source: "demo",
    }).run();
  }

  console.log(`[seed-mma] ниша MMA создана: ${res.id}, 12 demo videos, CS2 не тронут`);
  return { seeded: true, nicheId: res.id };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv[1] && process.argv[1].includes("seed-mma")) {
  const force = process.argv.includes("--force");
  seedMma(force).then(() => process.exit(0));
}