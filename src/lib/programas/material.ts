import type { PlanchuelaSize, ProgramLengthByPlanchuela, ProgramMachineType } from '@/lib/types/index';

/** Defaults confirmados (sección 0 / 7.4 del plan). */
export const LARGO_MAXIMO_PLANCHUELA_MM: Record<'C' | 'G' | 'XL', number> = {
  C: 400,
  G: 250,
  XL: 250,
};

export const DEFAULT_PERDIDA_CORTE_CM = 0.8;

/** Tamaños de planchuela que cada máquina puede fabricar (C y G hasta 38; XL solo 63). */
export const MACHINE_SIZE_ELIGIBILITY: Record<'C' | 'G' | 'XL', PlanchuelaSize[]> = {
  C: [12, 19, 25, 38],
  G: [12, 19, 25, 38],
  XL: [63],
};

export type StampDimsForMaterial = {
  anchoRealCm?: number | null;
  largoRealCm?: number | null;
  tipoPlanchuela?: number | null;
};

/** Misma lógica que el trigger de bronce_consumo: menor = ancho planchuela, mayor = largo a lo largo. */
export function resolvePlanchuelaRef(stamp: StampDimsForMaterial): PlanchuelaSize | null {
  if (stamp.tipoPlanchuela === 12 || stamp.tipoPlanchuela === 19 || stamp.tipoPlanchuela === 25
    || stamp.tipoPlanchuela === 38 || stamp.tipoPlanchuela === 63) {
    return stamp.tipoPlanchuela;
  }

  const ancho = Number(stamp.anchoRealCm) || 0;
  const largo = Number(stamp.largoRealCm) || 0;
  if (ancho <= 0 || largo <= 0) return null;

  const minorCm = Math.min(ancho, largo);
  if (minorCm <= 1.2) return 12;
  if (minorCm <= 2.0) return 19;
  if (minorCm <= 2.5) return 25;
  if (minorCm <= 4.0) return 38;
  return 63;
}

/** Si el sello entra en el rango de tamaños de la máquina (ABC admite cualquiera). */
export function isPlanchuelaEligibleForMachine(
  machine: ProgramMachineType,
  stamp: StampDimsForMaterial,
): boolean {
  if (machine === 'ABC') return true;
  const ref = resolvePlanchuelaRef(stamp);
  if (!ref) return false;
  return MACHINE_SIZE_ELIGIBILITY[machine].includes(ref);
}

/** Largo a lo largo de la planchuela + pérdida de corte, en mm. */
export function stampLengthAlongMm(
  stamp: StampDimsForMaterial,
  perdidaCorteCm: number = DEFAULT_PERDIDA_CORTE_CM,
): number {
  const ancho = Number(stamp.anchoRealCm) || 0;
  const largo = Number(stamp.largoRealCm) || 0;
  if (ancho <= 0 || largo <= 0) return 0;
  const majorCm = Math.max(ancho, largo);
  return (majorCm + perdidaCorteCm) * 10;
}

export function accumulateLengthByPlanchuela(
  stamps: StampDimsForMaterial[],
  perdidaCorteCm: number = DEFAULT_PERDIDA_CORTE_CM,
): ProgramLengthByPlanchuela {
  const acc: ProgramLengthByPlanchuela = {};
  for (const stamp of stamps) {
    const ref = resolvePlanchuelaRef(stamp);
    if (!ref) continue;
    const mm = stampLengthAlongMm(stamp, perdidaCorteCm);
    if (mm <= 0) continue;
    acc[ref] = (acc[ref] || 0) + mm;
  }
  return acc;
}

export function getMaxLengthMmForMachine(
  machine: ProgramMachineType,
  overrides?: Partial<Record<'C' | 'G' | 'XL', number>>,
): number | null {
  if (machine === 'ABC') return null;
  return overrides?.[machine] ?? LARGO_MAXIMO_PLANCHUELA_MM[machine];
}

/**
 * Valida si agregar `extraMm` a un acumulado de planchuela supera el máximo de la máquina.
 * Retorna null si OK, o mensaje de error si bloquea.
 */
export function validatePlanchuelaLengthLimit(opts: {
  machine: ProgramMachineType;
  tipoPlanchuela: PlanchuelaSize;
  currentMm: number;
  extraMm: number;
  maxOverrides?: Partial<Record<'C' | 'G' | 'XL', number>>;
}): string | null {
  const maxMm = getMaxLengthMmForMachine(opts.machine, opts.maxOverrides);
  if (maxMm == null) return null;
  const next = opts.currentMm + opts.extraMm;
  if (next <= maxMm + 1e-6) return null;
  return `Supera el largo máximo de planchuela ${opts.tipoPlanchuela}mm para máquina ${opts.machine} (${maxMm}mm). Usá otro programa para el excedente.`;
}

export function formatLengthByPlanchuela(lengths: ProgramLengthByPlanchuela): string[] {
  const order: PlanchuelaSize[] = [63, 38, 25, 19, 12];
  return order
    .filter((ref) => (lengths[ref] || 0) > 0)
    .map((ref) => `${ref}mm: ${Math.round(lengths[ref] || 0)}mm`);
}
