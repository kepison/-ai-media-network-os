import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { nanoid } from "nanoid";

export type NicheTemplateInput = {
  network_id?: string;
  name: string;
  slug?: string;
  description?: string;
  languages?: string[];
  geos?: string[];
  taxonomy?: string[];
  content_formats?: { key: string; name: string; duration: number; platform: string }[];
  research_sources?: { name: string; url: string; type: string }[];
  audience_profile?: Record<string, unknown>;
  monetization_categories?: string[];
  default_grids?: { name: string; type: string; columns: { key: string; label: string }[] }[];
  is_demo?: boolean;
};

export function createNicheFromTemplate(input: NicheTemplateInput) {
  const nicheId = "nc_" + nanoid(12);
  db.insert(s.niches).values({
    id: nicheId,
    network_id: input.network_id,
    name: input.name,
    slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-"),
    description: input.description,
    languages: input.languages ?? [],
    geos: input.geos ?? [],
    taxonomy: input.taxonomy ?? [],
    content_formats: input.content_formats ?? [],
    research_sources: input.research_sources ?? [],
    audience_profile: input.audience_profile ?? {},
    monetization_categories: input.monetization_categories ?? [],
    is_demo: input.is_demo ?? true,
  }).run();

  for (const cat of input.taxonomy ?? []) {
    db.insert(s.topics).values({
      id: "tp_" + nanoid(12),
      niche_id: nicheId,
      name: cat.toLowerCase().replace(/_/g, " "),
      category: cat,
    }).run();
  }

  // default grids
  const grids = input.default_grids ?? defaultGridsFor(input.name);
  for (const g of grids) {
    db.insert(s.grids).values({
      id: "gr_" + nanoid(12),
      niche_id: nicheId,
      name: g.name,
      type: g.type,
      columns: g.columns,
    }).run();
  }

  return { id: nicheId, name: input.name, slug: input.slug };
}

function defaultGridsFor(name: string) {
  return [
    { name: `${name} Content Grid`, type: "content", columns: [{ key: "title", label: "Title" }, { key: "topic", label: "Topic" }, { key: "views", label: "Views" }] },
    { name: `${name} Idea Grid`, type: "ideas", columns: [{ key: "title", label: "Title" }, { key: "viral_score", label: "Score" }] },
    { name: `${name} Experiments`, type: "experiments", columns: [{ key: "name", label: "Name" }, { key: "status", label: "Status" }] },
  ];
}

export function ensurePlatforms() {
  const existing = db.select().from(s.platforms).all();
  const keys = new Set(existing.map((p) => p.key));
  const defs = [
    { key: "youtube", name: "YouTube" },
    { key: "tiktok", name: "TikTok" },
    { key: "instagram", name: "Instagram" },
    { key: "telegram", name: "Telegram" },
  ];
  for (const d of defs) {
    if (!keys.has(d.key)) {
      db.insert(s.platforms).values({ id: "pf_" + nanoid(12), key: d.key, name: d.name, config: {} }).run();
    }
  }
}