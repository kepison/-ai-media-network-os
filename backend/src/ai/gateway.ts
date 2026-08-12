import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import {
  isModelFree,
  freeOnlyPolicyEnabled,
  assertFreeModel,
  markKeyCooldown,
  markKeyUsed,
  markModelUsed,
  PROVIDER_COOLDOWN_SEC,
  DEFAULT_COOLDOWN_SEC,
  nowSec,
  keyAvailable,
  selectCandidates,
} from "./scheduler.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOpts = {
  providerKey?: string;
  modelId?: string;
  capability?: string; // strong_reasoning | analytical | creative | fast | general
  temperature?: number;
  maxTokens?: number;
};

export type KeyEntry = { id?: string; value: string };

function getEnv(name: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[name];
}

// ---------- Provider adapters ----------

function vaultKeysRaw(providerKey: string) {
  try {
    return db
      .select()
      .from(s.api_keys)
      .where(and(eq(s.api_keys.provider, providerKey), eq(s.api_keys.enabled, true)))
      .all()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  } catch {
    return [];
  }
}

/** All enabled keys for a provider: env key (id undefined) + vault keys. */
export function providerKeyEntries(provider: any): KeyEntry[] {
  const out: KeyEntry[] = [];
  const envK = provider.env_key ? getEnv(provider.env_key) : undefined;
  if (envK) out.push({ value: envK });
  for (const r of vaultKeysRaw(provider.key)) out.push({ id: r.id, value: r.key_value });
  // dedupe by value, keep the first (vault id preferred for cooldown writes)
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.value) ? false : (seen.add(e.value), true)));
}

export function providerKeys(provider: any): string[] {
  return providerKeyEntries(provider).map((e) => e.value);
}

function maskKey(k: string | undefined) {
  if (!k) return "none";
  return k.length <= 8 ? "∗".repeat(k.length) : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function hasProviderKey(prov: any): boolean {
  if (prov?.kind !== "remote") return true;
  try {
    return providerKeys(prov).length > 0;
  } catch {
    return false;
  }
}

// ---------- Model resolution ----------

function allModels() {
  return db.select().from(s.models).all();
}
function allProviders() {
  return db.select().from(s.model_providers).all();
}

function resolveExplicit(providerKey: string, modelId?: string): { provider: any; model: any } {
  const provider = allProviders().find((p) => p.key === providerKey);
  if (!provider) throw new Error(`NO_PROVIDER: провайдер "${providerKey}" не найден`);
  let model;
  if (modelId) {
    model =
      allModels().find((m) => m.provider_id === provider.id && (m.model_id === modelId || m.name === modelId)) ??
      allModels().find((m) => m.model_id === modelId);
  } else {
    model = allModels()
      .filter((m) => m.provider_id === provider.id && m.enabled)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))[0];
  }
  if (!model) throw new Error(`NO_MODEL: модель "${modelId || "auto"}" для провайдера ${providerKey} не найдена`);
  // FREE-ONLY POLICY — mandatory. No paid model executes; no paid fallback; no billing.
  assertFreeModel(model, provider);
  return { provider, model };
}

export async function resolveModel(opts: ChatOpts) {
  // explicit target (used for fallback to a specific provider)
  if (opts.providerKey) {
    return resolveExplicit(opts.providerKey, opts.modelId);
  }
  // deterministic free-tier selection: enabled → available → free/local → priority → capability
  const candidates = selectCandidates({ capability: opts.capability, strict: true });
  if (!candidates.length) {
    throw new Error(
      "NO_FREE_MODEL_AVAILABLE: All free providers currently rate-limited or without an available key."
    );
  }
  const c = candidates[0];
  return { provider: c.provider, model: c.model };
}

// ---------- Chat ----------

export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<any> {
  const { provider, model } = await resolveModel(opts);
  const body: any = {
    model: model.model_id,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const started = Date.now();
  let resp!: Response;
  let providerUsed = "unknown";
  let base = "";

  if (provider.kind === "local") {
    base = provider.base_url ?? "http://127.0.0.1:11434";
    providerUsed = "ollama";
  } else if (provider.key === "gemini") {
    base = provider.base_url ?? "https://generativelanguage.googleapis.com";
    providerUsed = "gemini";
    const geminiMessages = messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "user", parts: [{ text: `SYSTEM_INSTRUCTION: ${msg.content}` }] };
      }
      return { role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] };
    });
    body.contents = geminiMessages;
    body.generationConfig = {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1024,
    };
    delete body.messages;
    delete body.temperature;
    delete body.max_tokens;
  } else {
    base = provider.base_url ?? "https://openrouter.ai/api/v1";
    providerUsed = "openrouter";
  }

  const headersFor = (key: string): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (providerUsed === "openrouter") {
      h.Authorization = `Bearer ${key}`;
      h["HTTP-Referer"] = "http://localhost:4130";
      h["X-Title"] = "AI Media Network OS";
    }
    return h;
  };
  const urlFor = (key: string) =>
    providerUsed === "gemini"
      ? `${base}/v1beta/models/${model.model_id}:generateContent?key=${key}`
      : `${base}/v1/chat/completions`;

  // Key pool: env key (id undefined) + vault keys. Local models need no key.
  const pool: KeyEntry[] =
    provider.kind === "local" ? [{ value: "" }] : providerKeyEntries(provider);
  if (pool.length === 0) {
    throw new Error(
      `NO_KEY: нет ключей ${provider.key}. Добавьте в Settings → API Keys или задайте ${provider.env_key}`
    );
  }

  // Two-tier retry model:
  //   SHORT RETRY  — transient (timeout, 502, 503, 504, overload), few attempts w/ backoff.
  //   LONG COOLDOWN — quota (429, rate-limit, quota exhausted): persist cooldown, rotate key,
  //                   and (when no usable key remains) hand back to the scheduler for failover.
  const SHORT_RETRIES = 3;
  let attempt = 0;
  let keyIdx = 0;
  let lastErr = "";
  let success = false;
  let usedKeyId: string | undefined;

  // Skip keys currently in cooldown before we start.
  while (keyIdx < pool.length && usedKeyForbidden(pool[keyIdx])) keyIdx++;
  if (!(provider.kind === "local") && keyIdx >= pool.length) {
    throw new Error(
      `RATE_LIMIT_ALL: ${provider.key} — все ключи на cooldown (ближайший перезапуск через ${nextCoolingSoon(pool)}s).`
    );
  }

  while (!success && attempt < SHORT_RETRIES * Math.max(1, pool.length - keyIdx)) {
    if (keyIdx >= pool.length) break;
    const key = pool[keyIdx];
    if (!(provider.kind === "local") && usedKeyForbidden(key)) {
      keyIdx++;
      continue;
    }
    attempt++;
    try {
      resp = await fetch(urlFor(key.value), {
        method: "POST",
        headers: headersFor(key.value),
        body: JSON.stringify(body),
        signal: undefined,
      });
      if (resp.ok) {
        usedKeyId = key.id;
        success = true;
        break;
      }
      const rawNow = (await resp.json().catch(() => null)) as any;
      const msg = rawNow?.error?.message ?? rawNow?.message ?? JSON.stringify(rawNow).slice(0, 300);
      const retryAfterHeader = resp.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : undefined;

      if (resp.status === 429 || isQuotaError(resp.status, msg)) {
        // LONG COOLDOWN — never hammer an exhausted key.
        const secs = retryAfterSec ?? PROVIDER_COOLDOWN_SEC[provider.key] ?? DEFAULT_COOLDOWN_SEC;
        if (key.id) {
          markKeyCooldown(key.id, provider.key, secs, msg, `429/quota`);
          lastErr = `${provider.key} key=${maskKey(key.value)} cooldown ${secs}s`;
        } else {
          lastErr = `${provider.key} (env key) rate-limited [${resp.status}] ${msg.slice(0, 120)}`;
        }
        keyIdx++;
        if (keyIdx < pool.length && (provider.kind === "local" || !usedKeyForbidden(pool[keyIdx]))) {
          continue; // rotate to next key
        }
        throw new Error(
          `RATE_LIMIT_ALL: ${provider.key} — все доступные ключи исчерпаны. ${lastErr}`
        );
      }
      if (isTransient(resp.status)) {
        lastErr = `${providerUsed} [${resp.status}]`;
        await backoff(800 * attempt);
        continue; // short retry on same key
      }
      // provider refused this request (e.g. 400, 404): hard, do not retry
      throw new Error(`PROVIDER_ERR [${resp.status}] ${providerUsed}: ${msg}`);
    } catch (e) {
      const errMsg = (e as Error).message;
      if (errMsg.startsWith("RATE_LIMIT_ALL") || errMsg.startsWith("PROVIDER_ERR")) throw e;
      // network / transient
      const isNetwork = errMsg.startsWith("fetch failed") || (e as Error).name === "FetchError" || errMsg.startsWith("timeout");
      if (!isNetwork) throw e;
      lastErr = errMsg;
      await backoff(800 * attempt);
      if (attempt % SHORT_RETRIES === 0) {
        keyIdx++; // rotate after exhausting short retries on this key
      }
    }
  }
  if (!success || !resp) {
    throw new Error(`GATEWAY_ERR: ${lastErr || "сеть недоступна"}`);
  }
  if (usedKeyId) markKeyUsed(usedKeyId);
  markModelUsed(model.id);

  const latency = Date.now() - started;
  const raw = (await resp.json().catch(() => null)) as any;

  const content = providerUsed === "gemini"
    ? (raw?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "")
    : (raw?.choices?.[0]?.message?.content ?? "");
  const usage = providerUsed === "gemini"
    ? { prompt_tokens: raw?.usageMetadata?.promptTokenCount, completion_tokens: raw?.usageMetadata?.candidatesTokenCount }
    : (raw?.usage ?? {});
  return {
    content,
    provider: provider.key,
    provider_label: provider.name,
    model: raw?.model ?? model.model_id,
    latency_ms: latency,
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
    cost: estimateCost(provider, model.model_id, usage?.prompt_tokens, usage?.completion_tokens),
    raw: raw,
  };
}

function usedKeyForbidden(k: KeyEntry): boolean {
  if (!k.id) return false; // env key cannot be cooled down
  try {
    const row = db.select().from(s.api_keys).where(eq(s.api_keys.id, k.id)).all()[0];
    return row ? !keyAvailable(row) : false;
  } catch {
    return false;
  }
}

function nextCoolingSoon(pool: KeyEntry[]): number {
  let soon = DEFAULT_COOLDOWN_SEC;
  try {
    const keys = db.select().from(s.api_keys).all();
    for (const k of keys) {
      if ((k.cooldown_until ?? 0) > nowSec()) soon = Math.min(soon, (k.cooldown_until ?? 0) - nowSec());
    }
  } catch { /* noop */ }
  return Math.max(1, soon);
}

function parseRetryAfter(v: string): number | undefined {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  const d = new Date(v).getTime();
  if (!Number.isNaN(d)) return Math.max(1, Math.round((d - Date.now()) / 1000));
  return undefined;
}

function isTransient(status: number): boolean {
  return status >= 500 || status === 408;
}

function isQuotaError(status: number, msg: string): boolean {
  if (status === 429) return true;
  return /quota|rate.?limit|exhausted|429|too many/i.test(msg);
}

function backoff(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function estimateCost(provider: any, modelId: string, tin: number, tout: number): number {
  if (provider.kind === "local") return 0;
  const m = allModels().find((m) => m.model_id === modelId || m.name.includes(modelId));
  if (!m) return 0;
  return (tin ?? 0) / 1000 * (m.cost_in ?? 0) + (tout ?? 0) / 1000 * (m.cost_out ?? 0);
}

// ---------- Health ----------

export async function serverHealth() {
  const providers = db.select().from(s.model_providers).all();
  const out = [];
  for (const p of providers) {
    let status: string;
    if (p.kind === "local") {
      status = await checkProvider(p);
    } else if (p.kind === "remote") {
      const usable = db.select().from(s.api_keys).where(eq(s.api_keys.provider, p.key)).all().filter((k) => keyAvailable(k)).length;
      const total = db.select().from(s.api_keys).where(eq(s.api_keys.provider, p.key)).all().length;
      if (total === 0) status = "NO_KEY";
      else if (usable > 0) status = "OK";
      else status = "COOLDOWN";
    } else {
      status = "UNKNOWN";
    }
    out.push({ key: p.key, name: p.name, kind: p.kind, status, base_url: p.base_url, env_key: p.env_key });
  }
  return out;
}

async function checkProvider(p: any): Promise<"OK" | "ERROR" | "NO_KEY" | "UNKNOWN"> {
  try {
    if (p.kind === "local") {
      const r = await fetch(`${p.base_url}/api/tags`);
      return r.ok ? "OK" : "ERROR";
    }
    if (p.key === "gemini") {
      if (!hasProviderKey(p)) return "NO_KEY";
      const base = p.base_url ?? "https://generativelanguage.googleapis.com";
      const firstKey = providerKeys(p)[0];
      const r = await fetch(`${base}/v1beta/models:list?key=${firstKey}`, {
        headers: { "Content-Type": "application/json" },
      });
      return r.ok ? "OK" : "ERROR";
    }
    if (p.kind === "remote") {
      if (!hasProviderKey(p)) return "NO_KEY";
      const firstKey = providerKeys(p)[0];
      const r = await fetch(`${p.base_url}/v1/models`, {
        headers: { Authorization: `Bearer ${firstKey}` },
      });
      return r.ok ? "OK" : "ERROR";
    }
    return "UNKNOWN";
  } catch {
    return "ERROR";
  }
}

// ---------- JSON ----------

export function parseJsonLoose<T = any>(text: string): T | null {
  let candidate = text;
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidate = fence[1];
  try {
    return normalizeKeys(JSON.parse(candidate));
  } catch {
    const m = candidate.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return normalizeKeys(JSON.parse(m[0]));
      } catch {
        try {
          const s = candidate.indexOf("{");
          if (s === -1) return null;
          const trimmed = candidate.slice(s);
          const re = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/;
          const mm = trimmed.match(re);
          if (mm) return normalizeKeys(JSON.parse(mm[0]));
        } catch {
          return null;
        }
        return null;
      }
    }
    return null;
  }
}

function normalizeKeys(v: any): any {
  if (Array.isArray(v)) return v.map(normalizeKeys);
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const nk = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      out[nk] = normalizeKeys(val);
    }
    return out;
  }
  return v;
}

export function modelRouterHealth() {
  return { gateway: "active", adapters: ["ollama", "gemini", "openrouter"], queue: "free-tier" };
}