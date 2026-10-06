export interface Antiguedad {
  anios: number;
  meses: number;
  dias: number;
}

function parseDateOnly(value: string | Date): { y: number; m: number; d: number } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Antigüedad entre fecha de ingreso y "hoy" (ambas como fecha de calendario, sin hora).
 * Usa el día del mes de ingreso; si el mes actual no lo tiene, se toma el último día del mes.
 */
export function calcularAntiguedad(
  fechaIngreso: string | Date,
  hoy: string | Date,
): Antiguedad {
  const from = parseDateOnly(fechaIngreso);
  const to = parseDateOnly(hoy);
  if (!from || !to) return { anios: 0, meses: 0, dias: 0 };

  let anios = to.y - from.y;
  let meses = to.m - from.m;
  let dias = to.d - from.d;

  if (dias < 0) {
    meses -= 1;
    const prevMonth = to.m === 1 ? 12 : to.m - 1;
    const prevYear = to.m === 1 ? to.y - 1 : to.y;
    dias += daysInMonth(prevYear, prevMonth);
  }
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  if (anios < 0) return { anios: 0, meses: 0, dias: 0 };
  return { anios, meses, dias };
}

/** Texto legible: "2 años y 3 meses" / "4 meses" / "Ingresó hoy". */
export function formatearAntiguedad(a: Antiguedad): string {
  if (a.anios === 0 && a.meses === 0 && a.dias === 0) return 'Ingresó hoy';
  if (a.anios === 0 && a.meses === 0) {
    return a.dias === 1 ? '1 día' : `${a.dias} días`;
  }
  if (a.anios === 0) {
    return a.meses === 1 ? '1 mes' : `${a.meses} meses`;
  }
  if (a.meses === 0) {
    return a.anios === 1 ? '1 año' : `${a.anios} años`;
  }
  const aniosTxt = a.anios === 1 ? '1 año' : `${a.anios} años`;
  const mesesTxt = a.meses === 1 ? '1 mes' : `${a.meses} meses`;
  return `${aniosTxt} y ${mesesTxt}`;
}

export function calcularYFormatearAntiguedad(
  fechaIngreso: string | Date,
  hoy: string | Date,
): string {
  return formatearAntiguedad(calcularAntiguedad(fechaIngreso, hoy));
}
