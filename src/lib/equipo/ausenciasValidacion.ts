/** Reglas puras de validación al cargar vacaciones / cambios de día (EQ-R05, EQ-R09, EQ-R10). */

export type RangoAusencia = {
  id?: string;
  tipo: 'vacaciones' | 'cambio_dia';
  fechaDesde: string;
  fechaHasta: string;
};

/** EQ-R05: quien no es admin solo carga a futuro (> hoy, hora AR). */
export function fechaNoPermitidaParaNoAdmin(fecha: string, hoy: string): boolean {
  return fecha <= hoy;
}

/** Años (YYYY) que toca el rango [desde, hasta]. */
export function aniosDelRango(desde: string, hasta: string): number[] {
  const y0 = Number(desde.slice(0, 4));
  const y1 = Number(hasta.slice(0, 4));
  if (!Number.isFinite(y0) || !Number.isFinite(y1) || y1 < y0) return [];
  const out: number[] = [];
  for (let y = y0; y <= y1; y += 1) out.push(y);
  return out;
}

/**
 * EQ-R10: ausencias propias (vacaciones o cambios de día) que se superponen con
 * [desde, hasta]. `excluirId` deja afuera la que se está editando.
 */
export function ausenciasPropiasSuperpuestas(
  desde: string,
  hasta: string,
  propias: RangoAusencia[],
  excluirId?: string | null,
): RangoAusencia[] {
  return propias.filter(
    (a) =>
      (!excluirId || a.id !== excluirId) &&
      desde <= a.fechaHasta &&
      hasta >= a.fechaDesde,
  );
}
