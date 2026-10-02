import { eachDateKey, isWeekday, parseDateOnly, toDateKey } from './fechas';

/** Fechas de feriado (cualquier origen) como YYYY-MM-DD. */
export type FeriadoFecha = string;

/**
 * Cuenta lunes a viernes en [desde, hasta] que no son feriado (D5).
 * `feriados` puede ser un Set o un array de YYYY-MM-DD.
 */
export function contarDiasHabiles(
  desde: string | Date,
  hasta: string | Date,
  feriados: Iterable<FeriadoFecha> | Set<FeriadoFecha>,
): number {
  const d0 = parseDateOnly(desde);
  const d1 = parseDateOnly(hasta);
  if (!d0 || !d1) return 0;
  const from = toDateKey(d0);
  const to = toDateKey(d1);
  if (from > to) return 0;

  const set = feriados instanceof Set ? feriados : new Set(feriados);
  let count = 0;
  for (const key of eachDateKey(from, to)) {
    if (!isWeekday(key)) continue;
    if (set.has(key)) continue;
    count += 1;
  }
  return count;
}

/** Lista de días hábiles en el rango (útil para desglose). */
export function listarDiasHabiles(
  desde: string | Date,
  hasta: string | Date,
  feriados: Iterable<FeriadoFecha> | Set<FeriadoFecha>,
): string[] {
  const d0 = parseDateOnly(desde);
  const d1 = parseDateOnly(hasta);
  if (!d0 || !d1) return [];
  const from = toDateKey(d0);
  const to = toDateKey(d1);
  if (from > to) return [];

  const set = feriados instanceof Set ? feriados : new Set(feriados);
  const out: string[] = [];
  for (const key of eachDateKey(from, to)) {
    if (!isWeekday(key)) continue;
    if (set.has(key)) continue;
    out.push(key);
  }
  return out;
}
