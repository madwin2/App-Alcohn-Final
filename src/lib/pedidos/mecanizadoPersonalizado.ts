/**
 * Mecanizado de un sello tipo Personalizado. Se guarda en `sellos.item_config.mecanizado`.
 * Las operaciones corresponden a las trayectorias de la base de Aspire:
 * rosca = «0 Taladrado» + «0 Roscado»; exterior = «1 Cajeado 6MM»;
 * grabado = «2 Cajeado 1MM» y «3 Perfilado 0.5MM» (cónicas de 1 y 0,6 mm, una sola profundidad).
 */
export type Rosca = 'M6' | 'M5' | 'M4' | 'SIN_ROSCA';

export interface MecanizadoPersonalizado {
  rosca: Rosca;
  /** Profundidad del exterior con fresa de 6 mm. `null` = la misma que Clásico. */
  exteriorDepthMm: number | null;
  /** Profundidad de las dos cónicas de grabado (1 mm y 0,6 mm). */
  grabadoDepthMm: number;
  /** Perfilado recto con fresa de 1 mm. */
  perfiladoRecto1mm: boolean;
}

export const ROSCA_OPTIONS: { value: Rosca; label: string }[] = [
  { value: 'M6', label: 'M6' },
  { value: 'M5', label: 'M5' },
  { value: 'M4', label: 'M4' },
  { value: 'SIN_ROSCA', label: 'Sin rosca' },
];

/** Valores de Clásico (rosca M6, grabado 1,7 mm). */
export const MECANIZADO_DEFAULT: MecanizadoPersonalizado = {
  rosca: 'M6',
  exteriorDepthMm: null,
  grabadoDepthMm: 1.7,
  perfiladoRecto1mm: false,
};

export const DEPTH_LIMIT_MM = 10;

const isRosca = (v: unknown): v is Rosca => ROSCA_OPTIONS.some((o) => o.value === v);
const isDepth = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= DEPTH_LIMIT_MM;

/** Lee lo guardado; completa con los valores de Clásico lo que falte o sea inválido. */
export function readMecanizado(value: unknown): MecanizadoPersonalizado {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    rosca: isRosca(v.rosca) ? v.rosca : MECANIZADO_DEFAULT.rosca,
    exteriorDepthMm: isDepth(v.exteriorDepthMm) ? v.exteriorDepthMm : null,
    grabadoDepthMm: isDepth(v.grabadoDepthMm) ? v.grabadoDepthMm : MECANIZADO_DEFAULT.grabadoDepthMm,
    perfiladoRecto1mm: v.perfiladoRecto1mm === true,
  };
}

/** Acepta «1,7» o «1.7». Vacío = `null`. */
export function parseDepthInput(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return isDepth(n) ? Math.round(n * 100) / 100 : 'invalid';
}

export const formatMm = (n: number) => `${String(n).replace('.', ',')} mm`;

/** Resumen corto para tablas y tooltips. */
export function describeMecanizado(m: MecanizadoPersonalizado): string {
  return [
    m.rosca === 'SIN_ROSCA' ? 'Sin rosca' : `Rosca ${m.rosca}`,
    `Exterior ${m.exteriorDepthMm == null ? 'como Clásico' : formatMm(m.exteriorDepthMm)}`,
    `Grabado ${formatMm(m.grabadoDepthMm)}`,
    m.perfiladoRecto1mm ? 'Perfilado recto 1 mm' : null,
  ].filter(Boolean).join(' · ');
}
