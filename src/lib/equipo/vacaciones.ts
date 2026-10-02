import { contarDiasHabiles, listarDiasHabiles } from './diasHabiles';
import { compareDateKeys, parseDateOnly, toDateKey } from './fechas';

export type AusenciaVacaciones = {
  tipo: 'vacaciones' | 'cambio_dia';
  fechaDesde: string;
  fechaHasta: string;
  /** Solo cambio_dia; nunca entra al saldo (D19c). */
  fechaRecupero?: string | null;
};

export type SaldoVacacionesInput = {
  saldoBase: number;
  saldoBaseFecha: string;
  diasAnuales: number;
  ausencias: AusenciaVacaciones[];
  feriados: Iterable<string> | Set<string>;
  hoy: string;
};

export type SaldoVacaciones = {
  acreditados: number;
  usados: number;
  planificados: number;
  disponiblesHoy: number;
  disponiblesDespuesDePlanificadas: number;
};

function feriadosSet(feriados: Iterable<string> | Set<string>): Set<string> {
  return feriados instanceof Set ? feriados : new Set(feriados);
}

/** Cantidad de 1 de enero estrictamente posteriores a `base` y ≤ `hasta` (inclusive). */
export function contarAcreditacionesEnero(
  saldoBaseFecha: string,
  hasta: string,
  diasAnuales: number,
): number {
  const base = parseDateOnly(saldoBaseFecha);
  const end = parseDateOnly(hasta);
  if (!base || !end) return 0;

  let count = 0;
  // Primer 1/1 candidato: año siguiente al de la base si la base no es exactamente 1/1,
  // o el mismo año si base < 1/1 de ese año… "posteriores a saldoBaseFecha":
  // 1/1/Y cuenta si 1/1/Y > saldoBaseFecha y 1/1/Y <= hasta.
  for (let y = base.y; y <= end.y + 1; y += 1) {
    const jan1 = `${y}-01-01`;
    if (compareDateKeys(jan1, saldoBaseFecha) <= 0) continue;
    if (compareDateKeys(jan1, hasta) > 0) continue;
    count += 1;
  }
  return count * diasAnuales;
}

/**
 * Días hábiles de una ausencia de vacaciones que cuentan contra el saldo:
 * posteriores a saldoBaseFecha (los ≤ base ya están dentro del saldo base).
 */
export function diasVacacionesContables(
  ausencia: AusenciaVacaciones,
  saldoBaseFecha: string,
  feriados: Set<string>,
): string[] {
  if (ausencia.tipo !== 'vacaciones') return [];
  const from = ausencia.fechaDesde;
  const to = ausencia.fechaHasta;
  const all = listarDiasHabiles(from, to, feriados);
  return all.filter((d) => compareDateKeys(d, saldoBaseFecha) > 0);
}

/**
 * Saldo de vacaciones (D18, D19). Los cambios de día no restan (D19c).
 * Vacaciones con días ≤ saldoBaseFecha no restan.
 */
export function saldoVacaciones(input: SaldoVacacionesInput): SaldoVacaciones {
  const feriados = feriadosSet(input.feriados);
  const hoy = toDateKey(parseDateOnly(input.hoy) ?? { y: 1970, m: 1, d: 1 });
  const baseFecha = toDateKey(
    parseDateOnly(input.saldoBaseFecha) ?? { y: 1970, m: 1, d: 1 },
  );

  const acreditados = contarAcreditacionesEnero(
    baseFecha,
    hoy,
    input.diasAnuales,
  );

  let usados = 0;
  let planificados = 0;

  for (const a of input.ausencias) {
    const dias = diasVacacionesContables(a, baseFecha, feriados);
    for (const d of dias) {
      if (compareDateKeys(d, hoy) <= 0) usados += 1;
      else planificados += 1;
    }
  }

  const disponiblesHoy = input.saldoBase + acreditados - usados;
  const disponiblesDespuesDePlanificadas = disponiblesHoy - planificados;

  return {
    acreditados,
    usados,
    planificados,
    disponiblesHoy,
    disponiblesDespuesDePlanificadas,
  };
}

/**
 * Saldo proyectado a una fecha futura: incluye acreditaciones del 1/1
 * posteriores a hoy y ≤ esa fecha (para avisar al cargar vacaciones en otro año).
 */
export function saldoProyectado(
  input: SaldoVacacionesInput,
  fecha: string,
): number {
  const actual = saldoVacaciones(input);
  const hoy = toDateKey(parseDateOnly(input.hoy) ?? { y: 1970, m: 1, d: 1 });
  const target = toDateKey(parseDateOnly(fecha) ?? { y: 1970, m: 1, d: 1 });
  if (compareDateKeys(target, hoy) <= 0) {
    return actual.disponiblesHoy;
  }
  // Acreditaciones entre (hoy, fecha]: las que aún no entraron en disponiblesHoy.
  const base = parseDateOnly(input.saldoBaseFecha);
  const end = parseDateOnly(target);
  if (!base || !end) return actual.disponiblesHoy;

  let extras = 0;
  for (let y = base.y; y <= end.y + 1; y += 1) {
    const jan1 = `${y}-01-01`;
    if (compareDateKeys(jan1, input.saldoBaseFecha) <= 0) continue;
    if (compareDateKeys(jan1, hoy) <= 0) continue; // ya en acreditados
    if (compareDateKeys(jan1, target) > 0) continue;
    extras += input.diasAnuales;
  }
  return actual.disponiblesHoy + extras;
}

/**
 * Preview al cargar un rango nuevo: cuántos días hábiles son y cuánto quedaría
 * después (incluyendo acreditaciones futuras hasta el fin del rango y restando
 * lo ya planificado + el rango nuevo).
 */
export function previewCargaVacaciones(
  input: SaldoVacacionesInput,
  fechaDesde: string,
  fechaHasta: string,
): { diasHabiles: number; teQuedarian: number } {
  const feriados = feriadosSet(input.feriados);
  const baseFecha = toDateKey(
    parseDateOnly(input.saldoBaseFecha) ?? { y: 1970, m: 1, d: 1 },
  );
  const diasHabiles = contarDiasHabiles(fechaDesde, fechaHasta, feriados);
  // Solo cuentan los posteriores a la fecha base (igual que al persistir).
  const diasContables = listarDiasHabiles(fechaDesde, fechaHasta, feriados).filter(
    (d) => compareDateKeys(d, baseFecha) > 0,
  ).length;

  const proyectado = saldoProyectado(input, fechaHasta);
  const actual = saldoVacaciones(input);
  // proyectado ya es disponiblesHoy + créditos futuros; restar planificados existentes y los nuevos.
  const teQuedarian = proyectado - actual.planificados - diasContables;

  return { diasHabiles, teQuedarian };
}
