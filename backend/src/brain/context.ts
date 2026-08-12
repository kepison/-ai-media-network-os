import { AsyncLocalStorage } from "node:async_hooks";

export type BrainContext = {
  run_id: string;
  niche_id?: string;
  prompt_version_id?: string;
};

const store = new AsyncLocalStorage<BrainContext>();

export function runWithBrain<T>(ctx: BrainContext, fn: () => T | Promise<T>): Promise<T> {
  return store.run(ctx, async () => fn());
}

export function currentRun(): BrainContext | undefined {
  return store.getStore();
}