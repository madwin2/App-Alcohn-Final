import type { PlanchuelaSize, ProgramMachineType } from '@/lib/types/index';
import { isPlanchuelaEligibleForMachine } from './material';

export const ELIGIBLE_FAB_STATES = new Set(['Sin Hacer', 'Prioridad', 'Rehacer']);

export type EligibleStampRow = {
  id: string;
  estado_fabricacion?: string | null;
  tipo?: string | null;
  ancho_real?: number | string | null;
  largo_real?: number | string | null;
  ancho_fabricacion_mm?: number | string | null;
  largo_fabricacion_mm?: number | string | null;
  tipo_planchuela?: number | string | null;
};

export type StampProgramAssignment = {
  programa_id?: string | null;
  estado_fabricacion?: string | null;
};

/**
 * POL-017 / Q-PROG-009: un sello en Rehacer puede seguir atado al programa donde
 * falló (trazabilidad) y aun así figurar como disponible para un programa nuevo.
 */
export function isAvailableForNewProgram(stamp: StampProgramAssignment): boolean {
  if (!stamp.programa_id) return true;
  return stamp.estado_fabricacion === 'Rehacer';
}

/** Rehecho atado a otro programa: se puede transferir al destino sin quitarlo a mano. */
export function canAutoTransferRehacerFromOtherProgram(
  stamp: StampProgramAssignment,
  targetProgramId: string,
): boolean {
  if (!stamp.programa_id || stamp.programa_id === targetProgramId) return false;
  return stamp.estado_fabricacion === 'Rehacer';
}

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
    anchoFabricacionMm: stamp.ancho_fabricacion_mm != null ? Number(stamp.ancho_fabricacion_mm) : null,
    largoFabricacionMm: stamp.largo_fabricacion_mm != null ? Number(stamp.largo_fabricacion_mm) : null,
    tipoPlanchuela: stamp.tipo_planchuela != null ? Number(stamp.tipo_planchuela) as PlanchuelaSize : null,
  });
}
