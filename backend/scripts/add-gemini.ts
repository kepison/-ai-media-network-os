import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import * as s from "../src/db/schema.js";
import { nanoid } from "nanoid";

const existing = db.select().from(s.model_providers).where(eq(s.model_providers.key, "gemini")).all();
if (existing.length === 0) {
  const id = "mp_" + nanoid(12);
  db.insert(s.model_providers).values({
    id,
    key: "gemini",
    name: "Gemini (Free Tier)",
    kind: "remote",
    base_url: "https://generativelanguage.googleapis.com",
    env_key: "GEMINI_API_KEY",
    enabled: true,
    config: {},
  }).run();
  db.insert(s.models).values([
    { id: "mdl_" + nanoid(12), provider_id: id, model_id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (free)", context_size: 1048576, cost_in: 0, cost_out: 0, reasoning: false, capability: "fast", availability: "free", enabled: true, notes: "free fallback via Gemini API" },
    { id: "mdl_" + nanoid(12), provider_id: id, model_id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite (free)", context_size: 1048576, cost_in: 0, cost_out: 0, reasoning: false, capability: "analytical", availability: "free", enabled: true, notes: "free fallback via Gemini API" },
  ]).run();
  console.log("gemini provider + models added");
} else {
  console.log("gemini provider already exists");
}