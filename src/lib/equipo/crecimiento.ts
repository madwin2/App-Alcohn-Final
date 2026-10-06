export type TipoObjetivo = 'objetivo' | 'aprender';
export type EstadoObjetivo = 'pendiente' | 'en_curso' | 'logrado' | 'abandonado';

export interface ObjetivoParticionable {
  id: string;
  tipo: TipoObjetivo;
  estado: EstadoObjetivo;
  titulo: string;
  fechaObjetivo: string | null;
  logradoAt: string | null;
  createdAt: string;
}

export const ESTADOS_OBJETIVO_ACTIVOS: EstadoObjetivo[] = ['pendiente', 'en_curso', 'abandonado'];

export function labelTipoObjetivo(tipo: TipoObjetivo): string {
  return tipo === 'aprender' ? 'Quiero aprender' : 'Objetivo';
}

export function labelEstadoObjetivo(estado: EstadoObjetivo): string {
  switch (estado) {
    case 'pendiente':
      return 'Pendiente';
    case 'en_curso':
      return 'En curso';
    case 'logrado':
      return 'Logrado';
    case 'abandonado':
      return 'Abandonado';
    default:
      return estado;
  }
}

/** Ciclo de avance sugerido en la UI (sin borrar). */
export function siguienteEstadoObjetivo(estado: EstadoObjetivo): EstadoObjetivo | null {
  switch (estado) {
    case 'pendiente':
      return 'en_curso';
    case 'en_curso':
      return 'logrado';
    default:
      return null;
  }
}

/**
 * Separa por tipo y dentro: activos (pendiente / en curso / abandonado) vs logrados.
 * Activos: en curso primero, después pendiente, abandonado al final; por creación desc.
 * Logrados: por logradoAt desc (fallback createdAt).
 */
export function particionarObjetivos(items: ObjetivoParticionable[]): {
  objetivosActivos: ObjetivoParticionable[];
  objetivosLogrados: ObjetivoParticionable[];
  aprenderActivos: ObjetivoParticionable[];
  aprenderLogrados: ObjetivoParticionable[];
} {
  const rankActivo = (e: EstadoObjetivo) => {
    if (e === 'en_curso') return 0;
    if (e === 'pendiente') return 1;
    return 2; // abandonado
  };

  const sortActivos = (a: ObjetivoParticionable, b: ObjetivoParticionable) => {
    const r = rankActivo(a.estado) - rankActivo(b.estado);
    if (r !== 0) return r;
    return b.createdAt.localeCompare(a.createdAt);
  };

  const sortLogrados = (a: ObjetivoParticionable, b: ObjetivoParticionable) => {
    const aa = a.logradoAt || a.createdAt;
    const bb = b.logradoAt || b.createdAt;
    return bb.localeCompare(aa);
  };

  const objetivos = items.filter((x) => x.tipo === 'objetivo');
  const aprender = items.filter((x) => x.tipo === 'aprender');

  return {
    objetivosActivos: objetivos.filter((x) => x.estado !== 'logrado').sort(sortActivos),
    objetivosLogrados: objetivos.filter((x) => x.estado === 'logrado').sort(sortLogrados),
    aprenderActivos: aprender.filter((x) => x.estado !== 'logrado').sort(sortActivos),
    aprenderLogrados: aprender.filter((x) => x.estado === 'logrado').sort(sortLogrados),
  };
}
