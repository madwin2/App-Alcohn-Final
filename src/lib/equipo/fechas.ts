/** Utilidades de fechas calendario YYYY-MM-DD (sin zona horaria). */

export type FechaParts = { y: number; m: number; d: number };

export function parseDateOnly(value: string | Date): FechaParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function toDateKey(p: FechaParts): string {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Día de la semana: 0=domingo … 6=sábado (igual que Date#getUTCDay con fecha local construida). */
export function weekdayOfKey(key: string): number {
  const p = parseDateOnly(key);
  if (!p) return -1;
  // UTC noon evita desfases DST al armar un Date solo-calendario.
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0)).getUTCDay();
}

export function isWeekday(key: string): boolean {
  const w = weekdayOfKey(key);
  return w >= 1 && w <= 5;
}

export function addDaysToKey(key: string, days: number): string {
  const p = parseDateOnly(key);
  if (!p) return key;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Itera inclusive [desde, hasta]. */
export function* eachDateKey(desde: string, hasta: string): Generator<string> {
  if (compareDateKeys(desde, hasta) > 0) return;
  let cur = desde;
  while (compareDateKeys(cur, hasta) <= 0) {
    yield cur;
    cur = addDaysToKey(cur, 1);
  }
}

export function monthStartKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEndKey(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0, 12, 0, 0)); // day 0 of next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
