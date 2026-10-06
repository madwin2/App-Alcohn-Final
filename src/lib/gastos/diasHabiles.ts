/**
 * Días hábiles de Alcohn: lunes a viernes que no son feriado ni día no laborable de la empresa
 * (tabla `feriados`, la misma del calendario del equipo — POL-045).
 * Lo que cae en un día no hábil se cuenta en el próximo hábil (mismo criterio que POL-070).
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Día de la semana de una fecha YYYY-MM-DD (0 = domingo), sin depender de la zona horaria. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function esDiaHabil(fecha: string, feriados: ReadonlySet<string>): boolean {
  const dow = diaSemana(fecha);
  return dow !== 0 && dow !== 6 && !feriados.has(fecha);
}

/** Todos los días hábiles del mes (YYYY-MM), ordenados. */
export function diasHabilesDelMes(mes: string, feriados: ReadonlySet<string>): string[] {
  const [y, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= total; d++) {
    const fecha = `${mes}-${pad2(d)}`;
    if (esDiaHabil(fecha, feriados)) out.push(fecha);
  }
  return out;
}

/**
 * Día hábil al que se imputa algo que pasó en `fecha` (ej. una venta web un sábado):
 * el mismo día si es hábil; si no, el próximo hábil del mes; si el mes ya no tiene más
 * hábiles, el último hábil anterior. `null` si el mes no tiene días hábiles.
 */
export function diaHabilImputado(fecha: string, habilesMes: readonly string[]): string | null {
  if (!habilesMes.length) return null;
  for (const h of habilesMes) if (h >= fecha) return h;
  return habilesMes[habilesMes.length - 1];
}

export type ResumenHabiles = {
  /** Hábiles del mes. */
  total: number;
  /** Hábiles ya terminados (anteriores a hoy). */
  completos: number;
  /** Hábiles que quedan, contando hoy si es hábil. */
  restantes: number;
  hoyEsHabil: boolean;
};

export function resumenHabiles(habilesMes: readonly string[], hoy: string): ResumenHabiles {
  const completos = habilesMes.filter((h) => h < hoy).length;
  return {
    total: habilesMes.length,
    completos,
    restantes: habilesMes.length - completos,
    hoyEsHabil: habilesMes.includes(hoy),
  };
}

export type VentaDiaHabil = {
  fecha: string;
  ventas: number;
  pedidos: number;
  /** Fechas no hábiles cuyas ventas se sumaron a este día. */
  trasladadasDe: string[];
};

/** Agrupa ventas por día calendario en días hábiles (lo de fines de semana y feriados pasa al próximo hábil). */
export function ventasPorDiaHabil(
  ventas: ReadonlyArray<{ fecha: string; ventas: number; pedidos: number }>,
  habilesMes: readonly string[],
): VentaDiaHabil[] {
  const map = new Map<string, VentaDiaHabil>(habilesMes.map((h) => [h, { fecha: h, ventas: 0, pedidos: 0, trasladadasDe: [] }]));
  for (const v of ventas) {
    const destino = diaHabilImputado(v.fecha, habilesMes);
    if (!destino) continue;
    const d = map.get(destino)!;
    d.ventas += v.ventas;
    d.pedidos += v.pedidos;
    if (destino !== v.fecha && !d.trasladadasDe.includes(v.fecha)) d.trasladadasDe.push(v.fecha);
  }
  return habilesMes.map((h) => map.get(h)!);
}
