/** Zona horaria de negocio (Argentina). Evita desfases UTC↔local al guardar/agrupar fechas. */
export const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD del instante en zona Argentina. */
export function toArgentinaDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: ARGENTINA_TZ });
}

/** Hoy en Argentina como YYYY-MM-DD. */
export function todayArgentinaDateKey(): string {
  return toArgentinaDateKey(new Date());
}

/** YYYY-MM del instante en zona Argentina. */
export function toArgentinaMonthKey(isoOrDate: string | Date): string {
  const key = toArgentinaDateKey(isoOrDate);
  return key ? key.slice(0, 7) : '0000-00';
}

/** Mes actual en Argentina (YYYY-MM). */
export function currentArgentinaMonthKey(): string {
  return toArgentinaMonthKey(new Date());
}

/**
 * Clave de mes de negocio para una orden.
 * Preferimos `created_at` en AR (corrige fechas auto-guardadas en UTC);
 * si no hay timestamp, usamos `orderDate` como calendario (YYYY-MM-DD).
 */
export function orderBusinessMonthKey(order: {
  createdAt?: string | null;
  orderDate?: string | null;
}): string {
  if (order.createdAt) {
    const m = toArgentinaMonthKey(order.createdAt);
    if (m !== '0000-00') return m;
  }
  if (order.orderDate) {
    if (order.orderDate.includes('T')) {
      return toArgentinaMonthKey(order.orderDate);
    }
    const part = order.orderDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part.slice(0, 7);
  }
  return currentArgentinaMonthKey();
}

/** Etiqueta corta de mes (ej. "jul 26") desde YYYY-MM. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 15));
  return d.toLocaleString('es-AR', { month: 'short', year: '2-digit', timeZone: ARGENTINA_TZ });
}

/** Etiqueta larga (ej. "Julio 2026"). */
export function monthKeyLabelLong(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 15));
  const label = d.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: ARGENTINA_TZ,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function argentinaDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const key = toArgentinaDateKey(date);
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

export { pad2 as padArgentina2 };
