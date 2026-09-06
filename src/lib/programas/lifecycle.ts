import type { FabricationState, ProgramLifecycleState, ProgramStamp } from '@/lib/types/index';

export function deriveLifecycleFromStamps(
  base: ProgramLifecycleState,
  bloqueado: boolean,
  stamps: Array<Pick<ProgramStamp, 'fabricationState'> | { fabricationState?: FabricationState }>,
): ProgramLifecycleState {
  if (bloqueado || base === 'BLOQUEADO') return 'BLOQUEADO';
  if (stamps.length === 0) return base === 'LISTO' ? 'LISTO' : 'BORRADOR';

  const allDone = stamps.every(
    (s) => s.fabricationState === 'HECHO' || s.fabricationState === 'VERIFICAR',
  );
  if (allDone) return 'FINALIZADO';

  const anyDoing = stamps.some(
    (s) => s.fabricationState === 'HACIENDO' || s.fabricationState === 'RETOCAR',
  );
  if (anyDoing) return 'EN_FABRICACION';

  return base;
}
