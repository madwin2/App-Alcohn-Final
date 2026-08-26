export type AndreaniWorkerJob = {
  phase: 'idle' | 'queued' | 'running' | 'done' | 'error';
  kind: 'generate' | 'refill' | 'sync-labels' | null;
  detail: string;
  queueDepth: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastMessage: string | null;
  lastOk: boolean | null;
  updatedAt: string;
};

export async function fetchAndreaniWorkerJob(): Promise<AndreaniWorkerJob | null> {
  try {
    const res = await fetch('/api/andreani-job-status');
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { job?: AndreaniWorkerJob } | null;
    return json?.job ?? null;
  } catch {
    return null;
  }
}

export function isAndreaniJobActive(job: AndreaniWorkerJob | null | undefined): boolean {
  return Boolean(job && (job.phase === 'queued' || job.phase === 'running' || job.queueDepth > 0));
}

export function andreaniJobKindLabel(kind: AndreaniWorkerJob['kind']): string {
  switch (kind) {
    case 'generate':
      return 'Generar links';
    case 'refill':
      return 'Refill pool';
    case 'sync-labels':
      return 'Traer etiquetas';
    default:
      return 'Worker';
  }
}

/** Espera a que el job deje de estar activo. Devuelve el snapshot final. */
export async function waitAndreaniWorkerJob(opts?: {
  pollMs?: number;
  maxMs?: number;
  onUpdate?: (job: AndreaniWorkerJob) => void;
}): Promise<AndreaniWorkerJob | null> {
  const pollMs = opts?.pollMs ?? 4_000;
  const maxMs = opts?.maxMs ?? 12 * 60_000;
  const started = Date.now();
  let last: AndreaniWorkerJob | null = null;
  let sawActive = false;

  while (Date.now() - started < maxMs) {
    last = await fetchAndreaniWorkerJob();
    if (last) opts?.onUpdate?.(last);

    if (isAndreaniJobActive(last)) {
      sawActive = true;
    } else if (sawActive) {
      // Pasó por queued/running y ahora terminó.
      return last;
    } else if (Date.now() - started > 20_000) {
      // Nunca vio actividad: probablemente el 202 no encoló o el status no está desplegado.
      return last;
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
  return last;
}
