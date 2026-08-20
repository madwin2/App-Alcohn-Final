import { runGenerateJob, runRefillJob } from './generate-service.js';
import { runSyncLabelsJob } from './sync-labels-service.js';
import type { GenerateResult, SyncLabelsResult } from './types.js';

/** Pausa entre jobs para no saturar el portal. */
const GAP_BETWEEN_JOBS_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const job = tail.then(() => fn());
  tail = job
    .then(() => sleep(GAP_BETWEEN_JOBS_MS))
    .catch(() => sleep(GAP_BETWEEN_JOBS_MS));
  return job;
}

export function enqueueGenerateJob(count: number): Promise<GenerateResult> {
  return enqueue(() => runGenerateJob(count));
}

export function enqueueRefillJob(min?: number): Promise<GenerateResult> {
  return enqueue(() => runRefillJob(min));
}

export function enqueueSyncLabelsJob(): Promise<SyncLabelsResult> {
  return enqueue(() => runSyncLabelsJob());
}
