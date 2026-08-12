/**
 * Free-tier queue with automatic cooldown and failover.
 *
 * Deterministic model selection order:
 *   1. enabled
 *   2. available (provider + key not in cooldown)
 *   3. free / local (FREE-ONLY POLICY)
 *   4. lowest priority number
 *   5. capability match (fallback to general)
 *
 * Cooldown is persistent on api_keys / models. A provider/key that
 * returns 429 / quota exhausted is marked unavailable until Retry-After or a
 * conservative provider-specific cooldown has elapsed. We never hammer an
 * exhausted key, and we never spend retries on a known-exhausted quota.
 */
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { chat, type ChatMessage, type ChatOpts } from "./gateway.js";

export const PROVIDER_COOLDOWN_SEC: Record<string, number> = {
  gemini: 60,
  openrouter: 60,
  ollama: 0,
};
export const DEFAULT_COOLDOWN_SEC = 60;
const DEFAULT_PRIORITY = 100;

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function freeOnlyPolicyEnabled(): boolean {
  try {
    const row = db
      .select()
      .from(s.settings)
      .where(eq(s.settings.key, "free_only_policy"))
      .all()[0];
    return row?.value === false ? false : true;
  } catch {
    return true;
  }
}

// ---------- Provider / key availability ----------

export function keyAvailable(k: any): boolean {
  if (!k.enabled) return false;
  return (k.cooldown_until ?? 0) <= nowSec();
}

export function modelAvailable(m: any, provById: Map<string, any>): boolean {
  if (!m.enabled) return false;
  const prov = provById.get(m.provider_id ?? "");
  if (!prov || !prov.enabled) return false;
  if ((m.cooldown_until ?? 0) > nowSec()) return false;
  // FREE-ONLY POLICY: local (cost 0) or availability "free" only.
  if (!isModelFree(m, prov)) return false;
  // remote provider must have at least one usable (non-cooling) key
  if (prov.kind === "remote") return providerUsableKeyCount(prov.key) > 0;
  return true;
}

export function isModelFree(m: any, prov: any): boolean {
  return prov?.kind === "local" || m?.availability === "free";
}

export function providerUsableKeyCount(providerKey: string): number {
  try {
    const rows = db
      .select()
      .from(s.api_keys)
      .where(eq(s.api_keys.provider, providerKey))
      .all();
    const vaultUsable = rows.filter((k) => keyAvailable(k)).length;
    const envUsable = envKeySet(providerKey) ? 1 : 0;
    return vaultUsable + envUsable;
  } catch {
    return 0;
  }
}

function envKeySet(providerKey: string): boolean {
  const prov = db.select().from(s.model_providers).where(eq(s.model_providers.key, providerKey)).all()[0];
  if (!prov?.env_key) return false;
  return Boolean((process.env as Record<string, string | undefined>)[prov.env_key]);
}

export function hasProviderKeySource(providerKey: string): boolean {
  try {
    const rows = db.select().from(s.api_keys).where(eq(s.api_keys.provider, providerKey)).all().filter((k) => k.enabled);
    return rows.length > 0 || envKeySet(providerKey);
  } catch {
    return envKeySet(providerKey);
  }
}

export function hasProviderAnyKey(providerKey: string): boolean {
  return hasProviderKeySource(providerKey);
}

/** Mark a vault key as cooling down. If no retryAfter, use provider default. */
export function markKeyCooldown(keyId: string, providerKey: string, retryAfterSec?: number, error?: string, status?: string) {
  const secs = Math.max(1, retryAfterSec ?? PROVIDER_COOLDOWN_SEC[providerKey] ?? DEFAULT_COOLDOWN_SEC);
  const now = nowSec();
  const row = db.select().from(s.api_keys).where(eq(s.api_keys.id, keyId)).all()[0];
  const count = (row?.rate_limit_count ?? 0) + 1;
  db.update(s.api_keys)
    .set({
      cooldown_until: now + secs,
      last_error: error ? String(error).slice(0, 300) : undefined,
      last_status: status ?? "rate_limited",
      rate_limit_count: count,
      last_used_at: now,
    })
    .where(eq(s.api_keys.id, keyId))
    .run();
}

export function markKeyUsed(keyId: string) {
  db.update(s.api_keys)
    .set({ last_used_at: nowSec(), last_status: "ok", last_error: undefined })
    .where(eq(s.api_keys.id, keyId))
    .run();
}

export function markModelUsed(modelId: string) {
  db.update(s.models).set({ last_used_at: nowSec() }).where(eq(s.models.id, modelId)).run();
}

export function setModelCooldown(modelId: string, seconds: number) {
  const now = nowSec();
  db.update(s.models).set({ cooldown_until: now + Math.max(1, seconds) }).where(eq(s.models.id, modelId)).run();
}

export function clearModelCooldown(modelId: string) {
  db.update(s.models).set({ cooldown_until: null }).where(eq(s.models.id, modelId)).run();
}

/** Only the vault keys carry an id we can apply cooldown to. */
// ---------- Model selection ----------

export type Candidate = { provider: any; model: any };

export function selectCandidates(opts: {
  capability?: string;
  strict?: boolean; // when true: paid models never considered
} = {}): Candidate[] {
  const cap = opts.capability ?? "general";
  const allModels = db.select().from(s.models).all();
  const allProv = db.select().from(s.model_providers).all();
  const provById = new Map(allProv.map((p) => [p.id, p]));
  const freeOnly = freeOnlyPolicyEnabled();

  const eligible = allModels
    .filter((m) => {
      if (!m.enabled) return false;
      const prov = provById.get(m.provider_id ?? "");
      if (!prov || !prov.enabled) return false;
      if ((m.cooldown_until ?? 0) > nowSec()) return false;
      if (!isModelFree(m, prov)) {
        // Paid models simply do not participate while free-only policy is on.
        if (freeOnly) return false;
        if (opts.strict ?? true) return false;
      }
      if (prov.kind === "remote" && providerUsableKeyCount(prov.key) === 0) return false;
      return true;
    })
    .map((m) => ({ provider: provById.get(m.provider_id ?? ""), model: m }));

  // capability match first, then any general
  const withCap = eligible.filter((c) => c.model.capability === cap);
  const general = eligible.filter((c) => c.model.capability !== cap);
  return [...withCap, ...general].sort(sortCandidates);
}

function sortCandidates(a: Candidate, b: Candidate) {
  const pa = a.model.priority ?? DEFAULT_PRIORITY;
  const pb = b.model.priority ?? DEFAULT_PRIORITY;
  if (pa !== pb) return pa - pb;
  // prefer local (zero-cost, no external quota) when priorities tie
  const la = a.provider?.kind === "local" ? 0 : 1;
  const lb = b.provider?.kind === "local" ? 0 : 1;
  if (la !== lb) return la - lb;
  // rotation / fairness: least-recently-used first
  const ua = a.model.last_used_at ?? 0;
  const ub = b.model.last_used_at ?? 0;
  if (ua !== ub) return ua - ub;
  return String(a.model.model_id).localeCompare(String(b.model.model_id));
}

export function selectBestModel(opts: { capability?: string } = {}): Candidate | null {
  return selectCandidates(opts)[0] ?? null;
}

/**
 * Walk the deterministic candidate chain and execute the first working free
 * model. Short-retries happen inside chat(); long quota cooldowns persist and
 * move us to the next candidate. Throws the last error otherwise.
 */
export async function chatBestEffort(messages: ChatMessage[], opts: ChatOpts = {}): Promise<any> {
  const candidates = selectCandidates({ capability: opts.capability, strict: true });
  if (!candidates.length) {
    const anyKey = Object.keys(PROVIDER_COOLDOWN_SEC).some((k) => hasProviderAnyKey(k));
    throw new Error(
      anyKey
        ? "NO_FREE_MODEL_AVAILABLE: All free providers currently rate-limited or without an available key."
        : "NO_MODEL_AVAILABLE: нет доступных моделей. Добавьте модель или включите Ollama с установленной моделью."
    );
  }
  let lastErr = "";
  let sawQuota = false;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const res = await chat(messages, {
        ...opts,
        providerKey: c.provider.key,
        modelId: c.model.model_id,
        capability: opts.capability,
      });
      markModelUsed(c.model.id);
      if (Object.prototype.hasOwnProperty.call(res, "fallback")) Object.assign(res, { fallback: i > 0 });
      else res.fallback = i > 0;
      return res;
    } catch (e) {
      const msg = (e as Error).message;
      lastErr = msg;
      if (msg.startsWith("RATE_LIMIT") || msg.startsWith("QUOTA_EXHAUSTED")) sawQuota = true;
      // never accumulate retries against a known-exhausted quota — move on.
    }
  }
  if (sawQuota) {
    throw new Error(`QUOTA_EXHAUSTED_ALL: ${lastErr}`);
  }
  throw new Error(lastErr || "NO_MODEL_AVAILABLE");
}

/** Earliest moment (epoch sec) when a cooldown expires, else Infinity. */
export function nextCooldownAt(): number {
  let earliest = Infinity;
  try {
    const keys = db.select().from(s.api_keys).where(eq(s.api_keys.enabled, true)).all();
    for (const k of keys) {
      if ((k.cooldown_until ?? 0) > nowSec()) earliest = Math.min(earliest, k.cooldown_until ?? 0);
    }
    const models = db.select().from(s.models).all();
    for (const m of models) {
      if (m.enabled && (m.cooldown_until ?? 0) > nowSec()) earliest = Math.min(earliest, m.cooldown_until ?? 0);
    }
  } catch {
    return nowSec() + 30;
  }
  return Number.isFinite(earliest) ? earliest : nowSec() + 30;
}

export function eligibleProviderNames(): string[] {
  const provNames: string[] = [];
  const allProv = db.select().from(s.model_providers).all();
  const freeOnly = freeOnlyPolicyEnabled();
  for (const p of allProv) {
    if (!p.enabled) continue;
    if (p.kind === "local") {
      provNames.push(p.name);
      continue;
    }
    if (freeOnly) {
      const freeModels = db
        .select()
        .from(s.models)
        .where(and(eq(s.models.provider_id, p.id), eq(s.models.availability, "free")))
        .all();
      if (freeModels.length && providerUsableKeyCount(p.key) > 0) provNames.push(p.name);
    } else {
      if (hasProviderKeySource(p.key)) provNames.push(p.name);
    }
  }
  return provNames;
}

// ---------- Scheduler diagnostics ----------

export function schedulerStatus() {
  const providers = db.select().from(s.model_providers).all();
  const models = db.select().from(s.models).all();
  const keys = db.select().from(s.api_keys).all();
  const now = nowSec();
  const out = {
    policy: freeOnlyPolicyEnabled() ? "free-only" : "allow-paid",
    next_cooldown_at: nextCooldownAt(),
    providers: providers.map((p) => {
      const myKeys = keys.filter((k) => k.provider === p.key);
      const usable = myKeys.filter((k) => keyAvailable(k)).length + (envKeySet(p.key) ? 1 : 0);
      const any = myKeys.some((k) => k.enabled) || envKeySet(p.key);
      return {
        key: p.key,
        name: p.name,
        kind: p.kind,
        enabled: p.enabled,
        usable_keys: usable,
        total_keys: myKeys.length,
        env_key_set: envKeySet(p.key),
        status:
          p.kind === "local"
            ? "local"
            : usable > 0
              ? "available"
              : !any
                ? "not_configured"
                : "cooldown",
      };
    }),
    models: models.map((m) => {
      const prov = providers.find((p) => p.id === m.provider_id);
      const fake = {} as any;
      Object.assign(fake, m);
      return {
        id: m.id,
        name: m.name,
        model_id: m.model_id,
        provider: prov?.key ?? m.provider_id,
        capability: m.capability,
        availability: m.availability,
        free: isModelFree(m, prov),
        local: prov?.kind === "local",
        enabled: Boolean(m.enabled),
        priority: m.priority ?? DEFAULT_PRIORITY,
        cooldown: (m.cooldown_until ?? 0) > now ? (m.cooldown_until ?? 0) - now : 0,
        last_used_at: m.last_used_at,
        selected: modelAvailable(m, new Map(providers.map((p) => [p.id, p]))) ? "READY" : statusUnavailable(m, prov),
      };
    }),
    keys: keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      label: k.label,
      enabled: Boolean(k.enabled),
      priority: k.priority,
      cooldown_until: k.cooldown_until,
      cooldown_left: (k.cooldown_until ?? 0) > now ? ((k.cooldown_until ?? 0) - now) : 0,
      last_status: k.last_status,
      last_error: k.last_error,
      rate_limit_count: k.rate_limit_count,
      last_used_at: k.last_used_at,
    })),
  };
  return out;
}

function statusUnavailable(m: any, prov: any): string {
  if (!m.enabled) return "DISABLED";
  if (prov && !(prov.kind === "local") && !isModelFree(m, prov)) return "PAID_BLOCKED";
  if ((m.cooldown_until ?? 0) > nowSec()) return "COOLDOWN";
  if (prov?.kind === "remote" && providerUsableKeyCount(prov.key) === 0) {
    return hasProviderKeySource(prov.key) ? "COOLDOWN" : "NOT_CONFIGURED";
  }
  return "READY";
}

/** Free-only guard used everywhere a model is about to execute. */
export function assertFreeModel(m: any, prov: any) {
  if (freeOnlyPolicyEnabled()) {
    if (!isModelFree(m, prov)) {
      const msg = `PAID_MODEL_BLOCKED: ${prov?.key}/${m?.model_id} не участвует в исполнении (free-only policy).`;
      console.warn(`[scheduler] ${msg}`);
      throw new Error(msg);
    }
  }
}