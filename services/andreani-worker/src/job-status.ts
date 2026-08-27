export type WorkerJobKind = 'generate' | 'refill' | 'sync-labels' | 'sync-tracking';

export type WorkerJobPhase = 'idle' | 'queued' | 'running' | 'done' | 'error';

export type WorkerJobSnapshot = {
  phase: WorkerJobPhase;
  kind: WorkerJobKind | null;
  detail: string;
  queueDepth: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastMessage: string | null;
  lastOk: boolean | null;
  updatedAt: string;
};

type InternalState = {
  phase: WorkerJobPhase;
  kind: WorkerJobKind | null;
  detail: string;
  queueDepth: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastMessage: string | null;
  lastOk: boolean | null;
  updatedAt: number;
};

const state: InternalState = {
  phase: 'idle',
  kind: null,
  detail: 'Sin trabajos en curso',
  queueDepth: 0,
  startedAt: null,
  finishedAt: null,
  lastMessage: null,
  lastOk: null,
  updatedAt: Date.now(),
};

function touch(): void {
  state.updatedAt = Date.now();
}

export function getWorkerJobSnapshot(): WorkerJobSnapshot {
  return {
    phase: state.phase,
    kind: state.kind,
    detail: state.detail,
    queueDepth: state.queueDepth,
    startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    finishedAt: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
    lastMessage: state.lastMessage,
    lastOk: state.lastOk,
    updatedAt: new Date(state.updatedAt).toISOString(),
  };
}

export function bumpQueueDepth(delta: number): void {
  state.queueDepth = Math.max(0, state.queueDepth + delta);
  touch();
}

export function markJobQueued(kind: WorkerJobKind, detail: string): void {
  state.kind = kind;
  state.phase = state.phase === 'running' ? 'running' : 'queued';
  state.detail = detail;
  touch();
}

export function markJobRunning(kind: WorkerJobKind, detail: string): void {
  state.kind = kind;
  state.phase = 'running';
  state.detail = detail;
  state.startedAt = Date.now();
  state.finishedAt = null;
  touch();
}

export function setJobDetail(detail: string): void {
  if (state.phase !== 'running' && state.phase !== 'queued') return;
  state.detail = detail;
  touch();
}

export function markJobFinished(opts: {
  ok: boolean;
  message: string;
  detail?: string;
}): void {
  state.phase = opts.ok ? 'done' : 'error';
  state.detail = opts.detail || (opts.ok ? 'Listo' : 'Falló');
  state.lastMessage = opts.message;
  state.lastOk = opts.ok;
  state.finishedAt = Date.now();
  touch();
}
