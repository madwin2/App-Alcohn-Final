const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function parseDateOnly(value: string | Date): { y: number; m: number; d: number } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Día del cumpleaños en un año dado. 29/02 en año no bisiesto → 28/02. */
export function cumpleaniosEnAnio(
  fechaNacimiento: string | Date,
  anio: number,
): { y: number; m: number; d: number } | null {
  const n = parseDateOnly(fechaNacimiento);
  if (!n) return null;
  let d = n.d;
  if (n.m === 2 && n.d === 29 && !isLeapYear(anio)) d = 28;
  return { y: anio, m: n.m, d };
}

function toKey(p: { y: number; m: number; d: number }): string {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Próximo cumpleaños a partir de hoy (inclusive si es hoy). Devuelve YYYY-MM-DD. */
export function proximoCumpleanios(
  fechaNacimiento: string | Date,
  hoy: string | Date,
): string | null {
  const today = parseDateOnly(hoy);
  if (!today) return null;
  const thisYear = cumpleaniosEnAnio(fechaNacimiento, today.y);
  if (!thisYear) return null;
  const thisKey = toKey(thisYear);
  const todayKey = toKey(today);
  if (compareKeys(thisKey, todayKey) >= 0) return thisKey;
  const next = cumpleaniosEnAnio(fechaNacimiento, today.y + 1);
  return next ? toKey(next) : null;
}

export function esCumpleaniosHoy(
  fechaNacimiento: string | Date,
  hoy: string | Date,
): boolean {
  const today = parseDateOnly(hoy);
  const bday = cumpleaniosEnAnio(fechaNacimiento, today?.y ?? 0);
  if (!today || !bday) return false;
  return today.m === bday.m && today.d === bday.d;
}

/** "14 de marzo" (sin el año). */
export function formatearCumpleaniosSinAnio(fechaNacimiento: string | Date): string | null {
  const n = parseDateOnly(fechaNacimiento);
  if (!n) return null;
  const mes = MESES_ES[n.m - 1];
  if (!mes) return null;
  return `${n.d} de ${mes}`;
}

/** "3 de agosto de 2023" (con año; para fecha de ingreso). */
export function formatearFechaLarga(fecha: string | Date): string | null {
  const n = parseDateOnly(fecha);
  if (!n) return null;
  const mes = MESES_ES[n.m - 1];
  if (!mes) return null;
  return `${n.d} de ${mes} de ${n.y}`;
}
