import type { PlanchuelaSize, ProgramMachineType } from '@/lib/types/index';
import { isPlanchuelaEligibleForMachine } from './material';

export const ELIGIBLE_FAB_STATES = new Set(['Sin Hacer', 'Prioridad', 'Rehacer']);

export type EligibleStampRow = {
  id: string;
  estado_fabricacion?: string | null;
  tipo?: string | null;
  ancho_real?: number | string | null;
  largo_real?: number | string | null;
  tipo_planchuela?: number | string | null;
};

export function isEligibleStampForMachine(
  stamp: EligibleStampRow,
  machine: ProgramMachineType,
  excludeStampIds?: Iterable<string>,
): boolean {
  if (excludeStampIds && new Set(excludeStampIds).has(stamp.id)) return false;
  if (!ELIGIBLE_FAB_STATES.has(stamp.estado_fabricacion || '')) return false;
  if (machine === 'ABC') return stamp.tipo === 'ABC';
  return isPlanchuelaEligibleForMachine(machine, {
    anchoRealCm: stamp.ancho_real != null ? Number(stamp.ancho_real) : null,
    largoRealCm: stamp.largo_real != null ? Number(stamp.largo_real) : null,
    tipoPlanchuela: stamp.tipo_planchuela != null ? Number(stamp.tipo_planchuela) as PlanchuelaSize : null,
  });
}
