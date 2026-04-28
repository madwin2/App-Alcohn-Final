/** Parámetros de fabricación (JSON en `fabricacion_parametros.params`, mismo esquema que la función SQL). */

export type VariableCostsState = {
  soldador100: number;
  soldador200: number;
  baseRemachadora: number;
  mangoGolpe: number;
  amortFresa: number;
  planchuela12: number;
  planchuela20: number;
  planchuela25: number;
  planchuela40: number;
  planchuela63: number;
  tubo: number;
  cajaAbc: number;
  mangoMadera: number;
  varilla: number;
  prisionero: number;
  soporteAbc: number;
  abcCmSimple: number;
  abcCmAmbas: number;
  selloPerdidaCorteCm: number;
};

export const DEFAULT_VARIABLE_COSTS: VariableCostsState = {
  soldador100: 13000,
  soldador200: 30000,
  baseRemachadora: 13000,
  mangoGolpe: 7000,
  amortFresa: 5600,
  planchuela12: 375,
  planchuela20: 530,
  planchuela25: 690,
  planchuela40: 1015,
  planchuela63: 2190,
  tubo: 1100,
  cajaAbc: 4000,
  mangoMadera: 860,
  varilla: 250,
  prisionero: 100,
  soporteAbc: 12000,
  abcCmSimple: 40,
  abcCmAmbas: 80,
  selloPerdidaCorteCm: 0.8,
};

const KEYS = Object.keys(DEFAULT_VARIABLE_COSTS) as (keyof VariableCostsState)[];

export function mergeVariableCostsFromDb(raw: unknown): VariableCostsState {
  const base = { ...DEFAULT_VARIABLE_COSTS };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  for (const k of KEYS) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isNaN(v)) base[k] = v;
    else if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) base[k] = n;
    }
  }
  return base;
}

export function variableCostsToParamsJson(state: VariableCostsState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of KEYS) {
    out[k] = state[k];
  }
  return out;
}
