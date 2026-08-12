/**
 * Free-tier queue entry point and background processing orchestration.
 *
 * A run that cannot execute because every suitable provider is cooling down
 * becomes QUEUED (not FAILED). The worker re-claims queued runs once the
 * earliest cooldown has expired and hands them to the orchestrator.
 */
import { db } from "../db/client.js";
import * as s from "../db/schema.js";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { updateRun, failRun } from "./service.js";
import { runDirectorOrchestration } from "../agents/orchestrator.js";
import {
  selectCandidates,
  nextCooldownAt,
  eligibleProviderNames,
  nowSec,
} from "../ai/scheduler.js";

export type QueueOutcome = { status: string; queued?: boolean; reason?: string };

function queueMeta(runId: string, reason: string): { next_retry_at: number; eligible_providers: string[] } {
  return {
    next_retry_at: nextCooldownAt(),
    eligible_providers: eligibleProviderNames(),
  };
}

export function queueRun(runId: string, reason: string) {
  const meta = queueMeta(runId, reason);
  updateRun(runId, {
    status: "queued",
    queued_reason: reason,
    next_retry_at: meta.next_retry_at,
    eligible_providers: meta.eligible_providers,
  });
}

/**
 * Create (or restore) a run and either start it immediately on the best free
 * model or park it in the queue when every provider is cooling down.
 */
export async function enqueueOrStart(input: {
  run_id: string;
  task: string;
  niche_id?: string;
  prompt_version_id?: string;
}): Promise<QueueOutcome> {
  const candidates = selectCandidates({ strict: true });
  if (candidates.length === 0) {
    // early-cooldown check: block must be quota/cooldown, not misconfiguration
    queueRun(
      input.run_id,
      "All free providers currently rate-limited. Задача поставлена в очередь и выполнится, когда станет доступен провайдер."
    );
    return { status: "queued", queued: true };
  }
  // claim the run so the worker doesn't double-start it
  updateRun(input.run_id, { status: "planning" });
  void runDirectorOrchestration(input.task, input.niche_id, input.run_id, input.prompt_version_id).catch(
    (e: Error) => failRun(input.run_id, e.message)
  );
  return { status: "started" };
}

/**
 * Claim all due queued runs and (re)start them. If still blocked, requeue with
 * a fresh next_retry_at. Returns number of runs processed.
 */
export async function processQueued(): Promise<number> {
  const now = nowSec();
  const due = db
    .select()
    .from(s.ai_runs)
    .where(and(eq(s.ai_runs.status, "queued"), or(isNull(s.ai_runs.next_retry_at), lte(s.ai_runs.next_retry_at, now))))
    .all();

  let processed = 0;
  for (const run of due) {
    if (!run.id) continue;
    const claimed = db
      .update(s.ai_runs)
      .set({ status: "planning" })
      .where(and(eq(s.ai_runs.id, run.id), eq(s.ai_runs.status, "queued")))
      .run();
    if (claimed.changes !== 1) continue; // someone else claimed it
    processed++;
    const candidates = selectCandidates({ strict: true });
    if (!candidates.length) {
      queueRun(run.id, "All free providers currently rate-limited. Ожидание доступного провайдера.");
      continue;
    }
    const pv = run.prompt_version_id || undefined;
    void runDirectorOrchestration(run.user_request, run.niche_id || undefined, run.id, pv).catch(
      (e: Error) => failRun(run.id, e.message)
    );
  }
  return processed;
}

/** Current queue snapshot for the UI. */
export function queueSnapshot() {
  const runs = db.select().from(s.ai_runs).where(eq(s.ai_runs.status, "queued")).all();
  const now = nowSec();
  return runs
    .sort((a, b) => (a.next_retry_at ?? 0) - (b.next_retry_at ?? 0))
    .map((r, idx) => ({
      run_id: r.id,
      position: idx + 1,
      user_request: r.user_request,
      reason: r.queued_reason ?? "queued",
      next_retry_at: r.next_retry_at,
      retry_in_s: (r.next_retry_at ?? 0) > now ? (r.next_retry_at ?? 0) - now : 0,
      eligible_providers: (r.eligible_providers as string[]) ?? [],
    }));
}