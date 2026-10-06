/** Reglas puras sobre ausencias del equipo (vacaciones / cambio de día). */

interface AusenciaPermisoLike {
  userId: string;
  fechaDesde: string;
}

/**
 * Quién puede editar/borrar una ausencia desde la UI (la RLS es la barrera real):
 * - admin: cualquiera;
 * - resto: solo las propias que todavía no empezaron.
 */
export function puedeEditarAusencia(
  a: AusenciaPermisoLike,
  viewerUserId: string,
  esAdmin: boolean,
  hoy: string,
): boolean {
  if (esAdmin) return true;
  return a.userId === viewerUserId && a.fechaDesde > hoy;
}

/** ¿Cambiaron las fechas de unas vacaciones? (cambiar solo la nota no avisa al equipo, EQ-R14). */
export function huboCambioDeFechas(
  antes: { fechaDesde: string; fechaHasta: string },
  despues: { fechaDesde: string; fechaHasta: string },
): boolean {
  return antes.fechaDesde !== despues.fechaDesde || antes.fechaHasta !== despues.fechaHasta;
}

export type MarcaAusenciaDia = 'vacaciones' | 'cambio_dia' | 'recupero';

/**
 * Qué marca mostrar en un día de "Mi semana" (EQ-R18): vacaciones, día de cambio
 * o día de recupero. Las vacaciones tienen prioridad. No mueve ni oculta tareas.
 */
export function marcaAusenciaDelDia(
  fecha: string,
  ausencias: ReadonlyArray<{
    tipo: 'vacaciones' | 'cambio_dia';
    fechaDesde: string;
    fechaHasta: string;
    fechaRecupero: string | null;
  }>,
): MarcaAusenciaDia | null {
  if (ausencias.some((a) => a.tipo === 'vacaciones' && a.fechaDesde <= fecha && fecha <= a.fechaHasta)) {
    return 'vacaciones';
  }
  if (ausencias.some((a) => a.tipo === 'cambio_dia' && a.fechaDesde <= fecha && fecha <= a.fechaHasta)) {
    return 'cambio_dia';
  }
  if (ausencias.some((a) => a.tipo === 'cambio_dia' && a.fechaRecupero === fecha)) {
    return 'recupero';
  }
  return null;
}
/**
 * Avisos (sin bloquear) sobre el día de recupero de un cambio de día (EQ-R19 / Q-EQ-012):
 * el recupero puede ser antes o después de la falta.
 */
export function avisosRecupero(input: {
  fecha: string | null;
  recupero: string | null;
  recuperoEsFeriado: boolean;
  recuperoEnVacaciones: boolean;
}): string[] {
  const { fecha, recupero } = input;
  if (!recupero) return [];
  const avisos: string[] = [];
  if (fecha && fecha === recupero) {
    avisos.push('El recupero es el mismo día que se falta: no recuperás nada.');
  }
  if (input.recuperoEsFeriado) {
    avisos.push('El día de recupero es feriado.');
  }
  if (input.recuperoEnVacaciones) {
    avisos.push('El día de recupero cae en tus vacaciones.');
  }
  return avisos;
}