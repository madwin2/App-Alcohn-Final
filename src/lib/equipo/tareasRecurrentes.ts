import { addDaysToKey, isWeekday, parseDateOnly, toDateKey, weekdayOfKey } from './fechas';

/** 1=lunes … 5=viernes (como en `tareas_recurrentes.dias_semana`). */
export type DiaSemana = 1 | 2 | 3 | 4 | 5;

export type FrecuenciaTarea = 'diaria' | 'semanal' | 'quincenal' | 'mensual';

export interface TareaRecurrenteDef {
  frecuencia: FrecuenciaTarea;
  diasSemana?: DiaSemana[] | null;
  diaMes?: number | null;
  /** Lunes de referencia para quincenal (YYYY-MM-DD). */
  semanaInicio?: string | null;
  activa?: boolean;
}

export interface OcurrenciaSemana {
  fecha: string;
  /** Semanal/diaria: cae en feriado (no se mueve). Mensual ya viene movida al hábil. */
  esFeriado: boolean;
}

const NOMBRE_DIA: Record<DiaSemana, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
};

/** Convierte weekday JS (0=dom…6=sáb) a 1=lun…5=vie; null si fin de semana. */
export function jsWeekdayToDiaSemana(js: number): DiaSemana | null {
  if (js >= 1 && js <= 5) return js as DiaSemana;
  return null;
}

/** Lunes de la semana que contiene `fecha` (YYYY-MM-DD). */
export function lunesDeSemana(fecha: string): string {
  const w = weekdayOfKey(fecha);
  if (w < 0) return fecha;
  // Domingo (0) → restar 6; lun=1 → 0; … sáb=6 → 5
  const back = w === 0 ? 6 : w - 1;
  return addDaysToKey(fecha, -back);
}

/** Diferencia en días entre dos claves (b − a). */
function diffDays(a: string, b: string): number {
  const pa = parseDateOnly(a);
  const pb = parseDateOnly(b);
  if (!pa || !pb) return 0;
  const da = Date.UTC(pa.y, pa.m - 1, pa.d);
  const db = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Quincenal: semanas pares respecto de `semanaInicio` (un lunes).
 * La semana de `semanaInicio` es la 0 (toca); la siguiente no; la +2 sí.
 */
export function esSemanaQuincenal(lunesSemana: string, semanaInicio: string): boolean {
  const inicio = lunesDeSemana(semanaInicio);
  const lunes = lunesDeSemana(lunesSemana);
  const weeks = Math.floor(diffDays(inicio, lunes) / 7);
  // Semanas negativas: −1 impar (no), −2 par (sí) → abs modulo
  return ((weeks % 2) + 2) % 2 === 0;
}

/** Último día del mes como YYYY-MM-DD. */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return toDateKey({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
}

/**
 * Día del mes anclado (D21): si no existe (31 en feb) → último del mes;
 * si cae en sáb/dom/feriado → día hábil siguiente (salta feriados encadenados).
 * Puede caer en el mes siguiente.
 */
export function ocurrenciaMensual(
  year: number,
  month: number,
  diaMes: number,
  feriados: Iterable<string> | Set<string>,
): string {
  const set = feriados instanceof Set ? feriados : new Set(feriados);
  const last = lastDayOfMonth(year, month);
  const lastParts = parseDateOnly(last)!;
  const day = Math.min(Math.max(1, diaMes), lastParts.d);
  let key = toDateKey({ y: year, m: month, d: day });

  // Avanzar hasta día hábil no feriado
  for (let i = 0; i < 14; i++) {
    if (isWeekday(key) && !set.has(key)) return key;
    key = addDaysToKey(key, 1);
  }
  return key;
}

/**
 * Una ocurrencia por mes calendario (year-month). Útil para tests y vistas mensuales.
 * Garantiza: no se pierde el mes; si el ancla cae en el mes siguiente, esa fecha
 * pertenece a ese mes (el mes original “cedió” su día hábil).
 */
export function ocurrenciaDelMes(
  year: number,
  month: number,
  diaMes: number,
  feriados: Iterable<string> | Set<string>,
): string {
  return ocurrenciaMensual(year, month, diaMes, feriados);
}

/**
 * Días de la semana (lun–vie) en que toca la tarea.
 * `lunesDeLaSemana` debe ser un lunes YYYY-MM-DD.
 */
export function ocurrenciasEnSemana(
  tarea: TareaRecurrenteDef,
  lunesDeLaSemana: string,
  feriados: Iterable<string> | Set<string>,
): OcurrenciaSemana[] {
  if (tarea.activa === false) return [];

  const set = feriados instanceof Set ? feriados : new Set(feriados);
  const lunes = lunesDeSemana(lunesDeLaSemana);
  const out: OcurrenciaSemana[] = [];

  const pushDia = (offset: number) => {
    const fecha = addDaysToKey(lunes, offset);
    out.push({ fecha, esFeriado: set.has(fecha) });
  };

  switch (tarea.frecuencia) {
    case 'diaria': {
      for (let i = 0; i < 5; i++) pushDia(i);
      break;
    }
    case 'semanal': {
      const dias = tarea.diasSemana ?? [];
      for (const d of [...new Set(dias)].sort((a, b) => a - b)) {
        if (d >= 1 && d <= 5) pushDia(d - 1);
      }
      break;
    }
    case 'quincenal': {
      if (!tarea.semanaInicio) break;
      if (!esSemanaQuincenal(lunes, tarea.semanaInicio)) break;
      const dias = tarea.diasSemana ?? [];
      for (const d of [...new Set(dias)].sort((a, b) => a - b)) {
        if (d >= 1 && d <= 5) pushDia(d - 1);
      }
      break;
    }
    case 'mensual': {
      if (tarea.diaMes == null) break;
      // Ocurrencias de los meses que pueden caer en esta semana (incluye spill).
      const pLun = parseDateOnly(lunes)!;
      const domingo = addDaysToKey(lunes, 6);
      const pDom = parseDateOnly(domingo)!;
      const months: Array<{ y: number; m: number }> = [
        { y: pLun.y, m: pLun.m },
        { y: pDom.y, m: pDom.m },
      ];
      // Mes anterior al lunes (spill de fin de mes previo)
      months.push({
        y: pLun.m === 1 ? pLun.y - 1 : pLun.y,
        m: pLun.m === 1 ? 12 : pLun.m - 1,
      });

      const candidates = new Set<string>();
      for (const { y, m } of months) {
        candidates.add(ocurrenciaMensual(y, m, tarea.diaMes, set));
      }

      for (const fecha of candidates) {
        if (fecha >= lunes && fecha <= domingo) {
          out.push({ fecha, esFeriado: false });
        }
      }
      out.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      break;
    }
    default:
      break;
  }

  return out;
}

export function describirFrecuencia(tarea: TareaRecurrenteDef): string {
  switch (tarea.frecuencia) {
    case 'diaria':
      return 'Todos los días';
    case 'semanal': {
      const dias = [...new Set(tarea.diasSemana ?? [])]
        .filter((d): d is DiaSemana => d >= 1 && d <= 5)
        .sort((a, b) => a - b);
      if (dias.length === 0) return 'Semanal';
      if (dias.length === 1) return `Todos los ${NOMBRE_DIA[dias[0]]}`;
      if (dias.length === 2) {
        return `Todos los ${NOMBRE_DIA[dias[0]]} y ${NOMBRE_DIA[dias[1]]}`;
      }
      const head = dias.slice(0, -1).map((d) => NOMBRE_DIA[d]);
      const last = NOMBRE_DIA[dias[dias.length - 1]];
      return `Todos los ${head.join(', ')} y ${last}`;
    }
    case 'quincenal': {
      const dias = [...new Set(tarea.diasSemana ?? [])]
        .filter((d): d is DiaSemana => d >= 1 && d <= 5)
        .sort((a, b) => a - b);
      if (dias.length === 0) return 'Cada 15 días';
      if (dias.length === 1) return `Cada 15 días, los ${NOMBRE_DIA[dias[0]]}`;
      if (dias.length === 2) {
        return `Cada 15 días, los ${NOMBRE_DIA[dias[0]]} y ${NOMBRE_DIA[dias[1]]}`;
      }
      const head = dias.slice(0, -1).map((d) => NOMBRE_DIA[d]);
      const last = NOMBRE_DIA[dias[dias.length - 1]];
      return `Cada 15 días, los ${head.join(', ')} y ${last}`;
    }
    case 'mensual': {
      const d = tarea.diaMes;
      if (d == null) return 'Mensual';
      return `El ${d} de cada mes`;
    }
    default:
      return '';
  }
}
