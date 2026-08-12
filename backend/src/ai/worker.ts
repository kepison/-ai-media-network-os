/**
 * Lightweight SQLite-backed worker for the FREE-TIER QUEUE.
 *
 * Polls queued runs, finds an available free model, executes, updates status,
 * sleeps. Wakes immediately when a new item is enqueued (kick) and no more
 * often than cooldown expiry allows. Poll interval 5-60s depending on state.
 */
import { processQueued } from "../brain/queue.js";
import { nextCooldownAt, nowSec } from "../ai/scheduler.js";

const MIN_POLL_MS = 5000;
const MAX_POLL_MS = 60000;

let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

async function loop() {
  try {
    await processQueued();
  } catch (e) {
    console.error("[worker] tick error:", (e as Error).message);
  } finally {
    schedule();
  }
}

function schedule() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const next = nextCooldownAt();
  const delay = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.max(0, next - nowSec()) * 1000));
  timer = setTimeout(() => {
    if (busy) return;
    busy = true;
    loop().finally(() => (busy = false));
  }, delay);
}

/** Wake the worker early (e.g. a new queue item was enqueued). */
export function kick() {
  schedule();
}

export function startWorker() {
  kick();
  console.log(`[worker] free-tier queue worker started (poll ${MIN_POLL_MS / 1000}-${MAX_POLL_MS / 1000}s)`);
}