/**
 * Lógica pura de "Mis números" (Etapa 7): períodos, agregaciones y textos.
 * Las consultas van en equipoNumeros.service.ts.
 */

import { ARGENTINA_TZ, monthKeyLabel, monthKeyLabelLong } from '@/lib/utils/argentinaDate';
import {
  addDaysToKey,
  compareDateKeys,
  monthEndKey,
  monthStartKey,
  parseDateOnly,
  type FechaParts,
} from './fechas';
import { lunesDeSemana } from './tareasRecurrentes';

export type PeriodoNumeros = 'semana' | 'mes' | 'anio';

/** Rango calendario inclusive [desde, hasta] en YYYY-MM-DD (día de negocio AR). */
export type RangoFecha = { desde: string; hasta: string };

export type EventoSelloHistorial = {
  selloId: string;
  ordenId: string;
  changedAt: string;
  /** `ordenes.tipo_pedido`; ausente o null = Venta. */
  tipoPedido?: string | null;
};

export type ConteoSellosPeriodo = {
  /** Sellos distintos que pasaron al estado en el rango. */
  total: number;
  /** De esos, cuántos pertenecen a pedidos Prueba. */
  pruebas: number;
};

const AR_OFFSET = '-03:00';

export function esAreaProduccion(area: string | null | undefined): boolean {
  return area === 'produccion';
}

/**
 * Galería de no-producción: solo si hay atribución real de envío
 * (`envio_datos_cargado_por`). Si en el futuro falta, la UI muestra "Pronto".
 */
export function galeriaEnviosDisponible(): boolean {
  return true;
}

/** Inicio UTC inclusive del día AR (Argentina sin DST). */
export function argentinaDayStartUtcIso(dateKey: string): string {
  return `${dateKey}T00:00:00${AR_OFFSET}`;
}

/** Fin exclusivo UTC: inicio del día siguiente en AR. */
export function argentinaDayEndExclusiveUtcIso(dateKey: string): string {
  return argentinaDayStartUtcIso(addDaysToKey(dateKey, 1));
}

export function rangoToUtcBounds(rango: RangoFecha): { gte: string; lt: string } {
  return {
    gte: argentinaDayStartUtcIso(rango.desde),
    lt: argentinaDayEndExclusiveUtcIso(rango.hasta),
  };
}

export function rangoPeriodo(tipo: PeriodoNumeros, hoy: string): RangoFecha {
  const p = parseDateOnly(hoy);
  if (!p) return { desde: hoy, hasta: hoy };

  if (tipo === 'semana') {
    const lunes = lunesDeSemana(hoy);
    return { desde: lunes, hasta: addDaysToKey(lunes, 6) };
  }
  if (tipo === 'mes') {
    return { desde: monthStartKey(p.y, p.m), hasta: monthEndKey(p.y, p.m) };
  }
  return { desde: `${p.y}-01-01`, hasta: `${p.y}-12-31` };
}

export function rangoPeriodoAnterior(tipo: PeriodoNumeros, hoy: string): RangoFecha {
  const actual = rangoPeriodo(tipo, hoy);
  if (tipo === 'semana') {
    const prevLunes = addDaysToKey(actual.desde, -7);
    return { desde: prevLunes, hasta: addDaysToKey(prevLunes, 6) };
  }
  if (tipo === 'mes') {
    const p = parseDateOnly(actual.desde);
    if (!p) return actual;
    const prev = shiftMonth(p, -1);
    return { desde: monthStartKey(prev.y, prev.m), hasta: monthEndKey(prev.y, prev.m) };
  }
  const p = parseDateOnly(hoy);
  if (!p) return actual;
  const y = p.y - 1;
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

function shiftMonth(p: FechaParts, delta: number): FechaParts {
  const d = new Date(Date.UTC(p.y, p.m - 1 + delta, 1, 12, 0, 0));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: 1 };
}

/** Últimos `n` meses calendario hasta el mes de `hoy` (inclusive), del más viejo al más nuevo. */
export function ultimosNMeses(hoy: string, n = 6): Array<{ key: string; label: string; rango: RangoFecha }> {
  const p = parseDateOnly(hoy);
  if (!p || n <= 0) return [];
  const out: Array<{ key: string; label: string; rango: RangoFecha }> = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = shiftMonth(p, -i);
    const key = `${m.y}-${String(m.m).padStart(2, '0')}`;
    out.push({
      key,
      label: monthKeyLabel(key),
      rango: { desde: monthStartKey(m.y, m.m), hasta: monthEndKey(m.y, m.m) },
    });
  }
  return out;
}

/** Etiqueta del período anterior para el texto de comparación. */
export function labelPeriodoAnterior(tipo: PeriodoNumeros, hoy: string): string {
  const prev = rangoPeriodoAnterior(tipo, hoy);
  if (tipo === 'semana') {
    return `la semana anterior`;
  }
  if (tipo === 'mes') {
    const key = prev.desde.slice(0, 7);
    const long = monthKeyLabelLong(key);
    // "Septiembre de 2026" / "Septiembre 2026" → "septiembre"
    const mes = long
      .replace(/\s+de\s+\d{4}$/i, '')
      .replace(/\s+\d{4}$/, '')
      .trim()
      .toLowerCase();
    return mes || key;
  }
  return String(parseDateOnly(hoy)?.y ? (parseDateOnly(hoy)!.y - 1) : prev.desde.slice(0, 4));
}

export function textoComparacion(actual: number, anterior: number, labelAnterior: string): string {
  const delta = actual - anterior;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} vs ${labelAnterior}`;
}

/**
 * Cuenta sellos distintos en el rango (por `changedAt` en hora AR vía date key).
 * Un sello rehecho que vuelve a Hecho cuenta **una** vez por período.
 */
export function contarSellosDistintosEnRango(
  eventos: EventoSelloHistorial[],
  rango: RangoFecha,
  opts?: { soloPruebas?: boolean },
): number {
  const ids = new Set<string>();
  for (const e of eventos) {
    if (!e.selloId) continue;
    const day = toArgentinaDateKeySafe(e.changedAt);
    if (!day) continue;
    if (compareDateKeys(day, rango.desde) < 0 || compareDateKeys(day, rango.hasta) > 0) continue;
    if (opts?.soloPruebas && !esPedidoPrueba(e.tipoPedido)) continue;
    ids.add(e.selloId);
  }
  return ids.size;
}

export function conteoSellosPeriodo(
  eventos: EventoSelloHistorial[],
  rango: RangoFecha,
): ConteoSellosPeriodo {
  const all = new Set<string>();
  const pruebas = new Set<string>();
  for (const e of eventos) {
    if (!e.selloId) continue;
    const day = toArgentinaDateKeySafe(e.changedAt);
    if (!day) continue;
    if (compareDateKeys(day, rango.desde) < 0 || compareDateKeys(day, rango.hasta) > 0) continue;
    all.add(e.selloId);
    if (esPedidoPrueba(e.tipoPedido)) pruebas.add(e.selloId);
  }
  return { total: all.size, pruebas: pruebas.size };
}

export function esPedidoPrueba(tipoPedido: string | null | undefined): boolean {
  return tipoPedido === 'Prueba';
}

/** Serie mensual: por cada mes, sellos distintos (útil para el gráfico de 6 meses). */
export function serieMensualSellos(
  eventos: EventoSelloHistorial[],
  meses: Array<{ key: string; label: string; rango: RangoFecha }>,
): Array<{ key: string; label: string; value: number }> {
  return meses.map((m) => ({
    key: m.key,
    label: m.label,
    value: contarSellosDistintosEnRango(eventos, m.rango),
  }));
}

/** Ordena selloIds por la fecha más reciente del evento en el rango (desc). */
export function ordenarSellosPorRecencia(
  eventos: EventoSelloHistorial[],
  rango: RangoFecha,
): string[] {
  const latest = new Map<string, string>();
  for (const e of eventos) {
    if (!e.selloId) continue;
    const day = toArgentinaDateKeySafe(e.changedAt);
    if (!day) continue;
    if (compareDateKeys(day, rango.desde) < 0 || compareDateKeys(day, rango.hasta) > 0) continue;
    const prev = latest.get(e.selloId);
    if (!prev || e.changedAt > prev) latest.set(e.selloId, e.changedAt);
  }
  return [...latest.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .map(([id]) => id);
}

export function paginarIds(ids: string[], offset: number, limit: number): string[] {
  if (limit <= 0) return [];
  return ids.slice(Math.max(0, offset), Math.max(0, offset) + limit);
}

function toArgentinaDateKeySafe(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: ARGENTINA_TZ });
  } catch {
    return '';
  }
}

/** Etiqueta corta del período actual (para UI). */
export function labelPeriodoActual(tipo: PeriodoNumeros, hoy: string): string {
  const r = rangoPeriodo(tipo, hoy);
  if (tipo === 'semana') {
    return `Semana del ${fmtDiaMes(r.desde)}`;
  }
  if (tipo === 'mes') {
    return monthKeyLabelLong(r.desde.slice(0, 7));
  }
  return String(parseDateOnly(hoy)?.y ?? r.desde.slice(0, 4));
}

function fmtDiaMes(key: string): string {
  const p = parseDateOnly(key);
  if (!p) return key;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0));
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function clampRangoHastaHoy(rango: RangoFecha, hoy: string): RangoFecha {
  if (compareDateKeys(rango.hasta, hoy) > 0) {
    return { desde: rango.desde, hasta: hoy };
  }
  return rango;
}
