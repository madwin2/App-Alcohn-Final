/**
 * Registro de ediciones de vectores: cómo se resume cada guardado y cómo se
 * mide cuánto acierta la corrección automática (PLAN_CORRECCION_AUTONOMA_VECTORES
 * §4-§7). Lógica pura, sin base de datos.
 */
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { machiningRecipe } from '@/lib/fresa/config';
import type { FixOperation } from '@/lib/fresa/fix';

export type EdicionOrigen = 'revision' | 'asignar' | 'pedidos' | 'produccion' | 'programas';
export type EdicionEleccion = 'original' | 'auto' | 'manual';
/**
 * - aceptada: la automática propuso algo y se guardó tal cual
 * - rechazada: propuso algo y se guardó el original
 * - editada: se guardó una versión hecha a mano
 * - sin_propuesta: la automática no tenía nada para cambiar
 */
export type EdicionResultado = 'aceptada' | 'rechazada' | 'editada' | 'sin_propuesta';
export type TipoCaso = 'letras_pegadas' | 'ojos' | 'mixto' | 'sin_problemas' | '3mm' | 'alimento';

export const TIPO_CASO_LABEL: Record<TipoCaso, string> = {
  letras_pegadas: 'Letras pegadas',
  ojos: 'Ojos tapados',
  mixto: 'Pegadas y ojos',
  sin_problemas: 'Sin problemas de fresa',
  '3mm': 'Sellos de 3 mm',
  alimento: 'Alimento',
};

/** Resumen del chequeo de fresa que se guarda (sin geometría). */
export interface ChequeoResumen {
  /** Lugares donde se pierde el diseño (alta + media). */
  lugares: number;
  alta: number;
  media: number;
  /** Lugares por tipo (un lugar puede tener más de un tipo). */
  porTipo: Partial<Record<'hueco_cerrado' | 'paso_angosto' | 'rincon' | 'angulo', number>>;
  /** Hueco más angosto entre los lugares (mm). */
  huecoMinMm: number | null;
  anchoMm: number;
  altoMm: number;
  error?: string;
}

export function resumirChequeo(r: FresaReport | null | undefined): ChequeoResumen | null {
  if (!r) return null;
  const groups = (r.check?.groups ?? []).filter((g) => g.severity !== 'baja');
  const porTipo: ChequeoResumen['porTipo'] = {};
  for (const g of groups) for (const k of new Set(g.kinds)) porTipo[k] = (porTipo[k] ?? 0) + 1;
  const huecos = groups.map((g) => g.gapWidthMm).filter((v) => Number.isFinite(v));
  return {
    lugares: r.groupCounts.alta + r.groupCounts.media,
    alta: r.groupCounts.alta,
    media: r.groupCounts.media,
    porTipo,
    huecoMinMm: huecos.length ? Math.round(Math.min(...huecos) * 1000) / 1000 : null,
    anchoMm: Math.round(r.widthMm * 100) / 100,
    altoMm: Math.round(r.heightMm * 100) / 100,
    ...(r.status === 'error' ? { error: r.error ?? 'error' } : {}),
  };
}

/** Qué tipo de caso es, para medir la confianza por separado. */
export function tipoDeCaso(params: {
  tipoSello?: string | null;
  alimento?: boolean;
  chequeoOriginal: ChequeoResumen | null;
}): TipoCaso {
  const recipe = machiningRecipe(params.tipoSello, params.alimento);
  if (recipe === '3MM') return '3mm';
  if (recipe === 'ALIMENTO') return 'alimento';
  const c = params.chequeoOriginal;
  if (!c || c.lugares === 0) return 'sin_problemas';
  const pegadas = c.porTipo.paso_angosto ?? 0;
  const ojos = c.porTipo.hueco_cerrado ?? 0;
  if (pegadas && ojos) return 'mixto';
  if (ojos) return 'ojos';
  return 'letras_pegadas';
}

export function resultadoDe(eleccion: EdicionEleccion, huboPropuesta: boolean): EdicionResultado {
  if (eleccion === 'manual') return 'editada';
  if (!huboPropuesta) return 'sin_propuesta';
  return eleccion === 'auto' ? 'aceptada' : 'rechazada';
}

export type { EditorLogEntry } from '@/lib/fresa/fix';

/** Segundos de edición a mano de una lista de operaciones (suma de los editores abiertos). */
export function segundosDeEdicion(ops: FixOperation[] | null | undefined): number | null {
  const manual = (ops ?? []).filter((o): o is Extract<FixOperation, { kind: 'manual' }> => o.kind === 'manual');
  if (!manual.length) return null;
  return manual.reduce((s, o) => s + (o.segundos ?? 0), 0);
}

// ---------------------------------------------------------------- calidad

/** Niveles de autonomía (PLAN §7, Q-VEC-013). */
export const NIVEL_APLICA_SOLA = 0.9;
export const NIVEL_AUTONOMA = 0.95;
/** 🔶 Propuesta: casos mínimos de un tipo antes de subir de nivel (a confirmar con los datos). */
export const CASOS_MINIMOS = 100;

export interface EdicionFila {
  sello_id: string | null;
  created_at: string;
  resultado: EdicionResultado;
  tipo_caso: string;
}

export interface CalidadTipo {
  tipo: string;
  total: number;
  /** Guardados donde la automática tenía que acertar: propuso algo o hubo que editar a mano. */
  propuestas: number;
  aceptadas: number;
  rechazadas: number;
  editadas: number;
  /** aceptadas / propuestas (null sin propuestas). */
  aceptacion: number | null;
  /** Sellos rehechos por error en el vector después de guardarse. */
  rehechos: number;
  /** 1 sugiere · 3 aplica sola y marca · 4 autónoma (2, modo sombra, es el registro mismo). */
  nivel: 1 | 3 | 4;
  /** Por qué no sube (o null si ya está en 4). */
  falta: string | null;
}

/**
 * Calidad de la automática por tipo de caso. `rehechos`: para cada sello, las
 * fechas en que se marcó rehacer por error en el vector; cuenta si es posterior
 * al guardado.
 */
export function calidadPorTipo(filas: EdicionFila[], rehechos: Map<string, string[]> = new Map()): CalidadTipo[] {
  const byTipo = new Map<string, EdicionFila[]>();
  for (const f of filas) byTipo.set(f.tipo_caso, [...(byTipo.get(f.tipo_caso) ?? []), f]);
  const out: CalidadTipo[] = [];
  for (const [tipo, rows] of byTipo) {
    const aceptadas = rows.filter((r) => r.resultado === 'aceptada').length;
    const rechazadas = rows.filter((r) => r.resultado === 'rechazada').length;
    // Editada a mano: la automática no alcanzó (propuso algo que no sirvió o no vio el problema).
    const editadas = rows.filter((r) => r.resultado === 'editada').length;
    const propuestas = aceptadas + rechazadas + editadas;
    const aceptacion = propuestas ? aceptadas / propuestas : null;
    const nRehechos = rows.filter((r) => r.sello_id && (rehechos.get(r.sello_id) ?? []).some((d) => d >= r.created_at)).length;
    let nivel: CalidadTipo['nivel'] = 1;
    let falta: string | null = null;
    if (tipo === '3mm') falta = 'Los sellos de 3 mm nunca se corrigen solos.';
    else if (propuestas < CASOS_MINIMOS) falta = `Faltan casos: ${propuestas} de ${CASOS_MINIMOS}.`;
    else if (nRehechos > 0) falta = `${nRehechos} sello${nRehechos === 1 ? '' : 's'} rehecho${nRehechos === 1 ? '' : 's'} por el vector.`;
    else if ((aceptacion ?? 0) < NIVEL_APLICA_SOLA) falta = `Acepta menos del ${NIVEL_APLICA_SOLA * 100} %.`;
    else if ((aceptacion ?? 0) < NIVEL_AUTONOMA) {
      nivel = 3;
      falta = `Para autónoma: ${NIVEL_AUTONOMA * 100} % de aceptación.`;
    } else nivel = 4;
    out.push({ tipo, total: rows.length, propuestas, aceptadas, rechazadas, editadas, aceptacion, rehechos: nRehechos, nivel, falta });
  }
  return out.sort((a, b) => b.total - a.total);
}
