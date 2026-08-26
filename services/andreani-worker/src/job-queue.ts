import { runGenerateJob, runRefillJob } from './generate-service.js';
import { runSyncLabelsJob } from './sync-labels-service.js';
import {
  bumpQueueDepth,
  markJobFinished,
  markJobQueued,
  markJobRunning,
  type WorkerJobKind,
} from './job-status.js';
import type { GenerateResult, SyncLabelsResult } from './types.js';

/** Pausa entre jobs para no saturar el portal. */
const GAP_BETWEEN_JOBS_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(
  kind: WorkerJobKind,
  queuedDetail: string,
  runningDetail: string,
  fn: () => Promise<T>,
  summarize: (result: T) => { ok: boolean; message: string },
): Promise<T> {
  bumpQueueDepth(1);
  markJobQueued(kind, queuedDetail);

  const job = tail.then(async () => {
    bumpQueueDepth(-1);
    markJobRunning(kind, runningDetail);
    try {
      const result = await fn();
      const summary = summarize(result);
      markJobFinished({
        ok: summary.ok,
        message: summary.message,
        detail: summary.ok ? 'Listo' : 'Terminó con error',
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markJobFinished({ ok: false, message, detail: 'Falló' });
      throw error;
    }
  });

  tail = job
    .then(() => sleep(GAP_BETWEEN_JOBS_MS))
    .catch(() => sleep(GAP_BETWEEN_JOBS_MS));
  return job;
}

export function enqueueGenerateJob(count: number): Promise<GenerateResult> {
  return enqueue(
    'generate',
    `En cola: generar ${count} link(s)`,
    `Generando ${count} link(s)…`,
    () => runGenerateJob(count),
    (r) => ({ ok: r.status === 'ok', message: r.message }),
  );
}

export function enqueueRefillJob(min?: number): Promise<GenerateResult> {
  return enqueue(
    'refill',
    `En cola: refill (min=${min ?? 15})`,
    `Refill pool (min=${min ?? 15})…`,
    () => runRefillJob(min),
    (r) => ({ ok: r.status === 'ok', message: r.message }),
  );
}

export function enqueueSyncLabelsJob(): Promise<SyncLabelsResult> {
  return enqueue(
    'sync-labels',
    'En cola: traer etiquetas',
    'Trayendo etiquetas del portal…',
    () => runSyncLabelsJob(),
    (r) => ({ ok: r.status === 'ok', message: r.message }),
  );
}
