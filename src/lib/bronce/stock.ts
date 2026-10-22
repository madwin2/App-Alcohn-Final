/**
 * Stock de planchuelas de bronce por pieza (docs/02-modules/stock/propuesta-stock-bronce.md).
 * La asignación replica `bronce_descontar_programa` (migration_bronce_stock_piezas.sql):
 * si se cambia una, cambiar la otra.
 */
import { LARGO_MAXIMO_PLANCHUELA_MM, MACHINE_SIZE_ELIGIBILITY } from '@/lib/programas/material';
import { PLANCHUELA_REF_ORDER, type PlanchuelaRef } from './planchuelaRef';

/** POL-095: una pieza sirve hasta 25 mm; por debajo es retazo. */
export const PIEZA_MIN_UTIL_MM = 25;

/** Aviso de compra: envío 2–3 días (FR-11) más margen. Valor inicial, a ajustar con el uso. */
export const AVISO_COBERTURA_DIAS = 7;
/** Cuántos días de consumo cubre la compra sugerida. Valor inicial, a ajustar con el uso. */
export const COMPRA_HORIZONTE_DIAS = 30;
/** Ventana de consumo que se promedia para la compra sugerida. */
export const CONSUMO_VENTANA_DIAS = 60;

export type MaquinaBronce = 'C' | 'G' | 'XL';
export type BronceEstadoPieza = 'disponible' | 'retazo' | 'baja';

export interface BroncePieza {
  id: string;
  anchoRef: PlanchuelaRef;
  largoMm: number;
  estado: BronceEstadoPieza;
}

const MAQUINAS: MaquinaBronce[] = ['C', 'G', 'XL'];

export function maquinasDeAncho(ref: PlanchuelaRef): MaquinaBronce[] {
  return MAQUINAS.filter((m) => MACHINE_SIZE_ELIGIBILITY[m].includes(ref));
}

export function esUtil(pieza: BroncePieza): boolean {
  return pieza.estado === 'disponible' && pieza.largoMm >= PIEZA_MIN_UTIL_MM;
}

const porLargo = (a: BroncePieza, b: BroncePieza) => a.largoMm - b.largoMm;

/**
 * POL-092: la pieza más corta en la que entra la fila sin pasar el máximo de la
 * máquina. En G/XL, si no hay ninguna, la más corta de las más largas (sobresale).
 */
export function elegirPieza(
  piezas: BroncePieza[],
  anchoRef: PlanchuelaRef,
  maquina: MaquinaBronce,
  largoMm: number,
  maxMm: number = LARGO_MAXIMO_PLANCHUELA_MM[maquina],
): { pieza: BroncePieza; sobresale: boolean } | null {
  const candidatas = piezas
    .filter((p) => p.anchoRef === anchoRef && p.estado === 'disponible' && p.largoMm >= largoMm)
    .sort(porLargo);
  const entra = candidatas.find((p) => p.largoMm <= maxMm);
  if (entra) return { pieza: entra, sobresale: false };
  if (maquina === 'C' || largoMm > maxMm) return null;
  const larga = candidatas.find((p) => p.largoMm > maxMm);
  return larga ? { pieza: larga, sobresale: true } : null;
}

export interface CapacidadMaquina {
  maquina: MaquinaBronce;
  maxMm: number;
  /** Piezas que dan una fila completa (largo ≥ máximo). */
  completas: number;
  /** Largos de las piezas más cortas que el máximo, de mayor a menor. */
  parciales: number[];
}

export interface ResumenAncho {
  anchoRef: PlanchuelaRef;
  /** Suma de las piezas útiles. */
  utilMm: number;
  /** Piezas útiles, de mayor a menor. */
  utiles: BroncePieza[];
  retazos: number;
  porMaquina: CapacidadMaquina[];
}

export function resumenAncho(
  piezas: BroncePieza[],
  anchoRef: PlanchuelaRef,
  maxOverrides?: Partial<Record<MaquinaBronce, number>>,
): ResumenAncho {
  const delAncho = piezas.filter((p) => p.anchoRef === anchoRef);
  const utiles = delAncho.filter(esUtil).sort((a, b) => b.largoMm - a.largoMm);
  return {
    anchoRef,
    utilMm: utiles.reduce((sum, p) => sum + p.largoMm, 0),
    utiles,
    retazos: delAncho.filter((p) => p.estado === 'retazo').length,
    porMaquina: maquinasDeAncho(anchoRef).map((maquina) => {
      const maxMm = maxOverrides?.[maquina] ?? LARGO_MAXIMO_PLANCHUELA_MM[maquina];
      return {
        maquina,
        maxMm,
        completas: utiles.filter((p) => p.largoMm >= maxMm).length,
        parciales: utiles.filter((p) => p.largoMm < maxMm).map((p) => p.largoMm),
      };
    }),
  };
}

export function resumenStock(piezas: BroncePieza[]): ResumenAncho[] {
  return PLANCHUELA_REF_ORDER.map((ref) => resumenAncho(piezas, ref));
}

/** Largo de corte que se pide para cada ancho: 400 para la C; 63 va solo a la XL (250). */
export function largoCorteMm(anchoRef: PlanchuelaRef): number {
  return maquinasDeAncho(anchoRef).includes('C') ? LARGO_MAXIMO_PLANCHUELA_MM.C : LARGO_MAXIMO_PLANCHUELA_MM.XL;
}

/** POL-091: se pide por metro con el corte, p. ej. 1 m = 2 × 400 + 1 × 200. */
export function cortarMetros(metros: number, corteMm: number): number[] {
  const total = Math.round(metros * 1000);
  const cortes: number[] = [];
  let resto = total;
  while (resto >= corteMm) {
    cortes.push(corteMm);
    resto -= corteMm;
  }
  if (resto >= PIEZA_MIN_UTIL_MM) cortes.push(resto);
  return cortes;
}

export interface CompraSugerida {
  anchoRef: PlanchuelaRef;
  consumoDiarioMm: number;
  /** Días que alcanzan las piezas útiles al ritmo actual; null si no hubo consumo. */
  coberturaDias: number | null;
  avisar: boolean;
  metros: number;
  cortes: number[];
}

export function sugerirCompra(params: {
  anchoRef: PlanchuelaRef;
  utilMm: number;
  consumoMm: number;
  dias?: number;
  avisoDias?: number;
  horizonteDias?: number;
}): CompraSugerida {
  const dias = params.dias ?? CONSUMO_VENTANA_DIAS;
  const avisoDias = params.avisoDias ?? AVISO_COBERTURA_DIAS;
  const horizonteDias = params.horizonteDias ?? COMPRA_HORIZONTE_DIAS;
  const consumoDiarioMm = dias > 0 ? Math.max(0, params.consumoMm) / dias : 0;
  if (consumoDiarioMm <= 0) {
    return { anchoRef: params.anchoRef, consumoDiarioMm: 0, coberturaDias: null, avisar: false, metros: 0, cortes: [] };
  }
  const coberturaDias = params.utilMm / consumoDiarioMm;
  const avisar = coberturaDias < avisoDias;
  const faltaMm = consumoDiarioMm * horizonteDias - params.utilMm;
  const metros = avisar ? Math.max(1, Math.ceil(faltaMm / 1000)) : faltaMm > 0 ? Math.ceil(faltaMm / 1000) : 0;
  return {
    anchoRef: params.anchoRef,
    consumoDiarioMm,
    coberturaDias,
    avisar,
    metros,
    cortes: metros > 0 ? cortarMetros(metros, largoCorteMm(params.anchoRef)) : [],
  };
}

/** «2 × 400 + 1 × 200». */
export function formatCortes(cortes: number[]): string {
  const grupos: Array<[number, number]> = [];
  for (const c of cortes) {
    const last = grupos[grupos.length - 1];
    if (last && last[0] === c) last[1] += 1;
    else grupos.push([c, 1]);
  }
  return grupos.map(([largo, n]) => `${n} × ${largo}`).join(' + ');
}

/**
 * Lee la lista de cortes de una compra: «2x400 + 1x200», «2 × 400, 200», «400 400 200».
 * Devuelve los largos en mm o lanza un error con el texto a corregir.
 */
export function parseCortes(texto: string): number[] {
  const partes = texto
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\s*x\s*/g, 'x')
    .replace(/\s*mm\b/g, '')
    .split(/[+;\s]+|,(?!\d)/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) throw new Error('Escribí al menos un corte, p. ej. 2x400 + 200.');
  const cortes: number[] = [];
  for (const parte of partes) {
    const m = parte.match(/^(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i);
    if (!m) throw new Error(`No entiendo «${parte}». Usá cantidad x largo, p. ej. 2x400.`);
    const cantidad = m[1] ? Number(m[1]) : 1;
    const largo = Number(m[2].replace(',', '.'));
    if (!cantidad || cantidad > 50) throw new Error(`Cantidad inválida en «${parte}».`);
    if (!(largo > 0) || largo > 2000) throw new Error(`Largo inválido en «${parte}» (mm).`);
    for (let i = 0; i < cantidad; i += 1) cortes.push(largo);
  }
  return cortes;
}
