export type EstadoIdeaCorcho = 'propuesta' | 'aprobada' | 'descartada';
export type ValorVotoCorcho = 1 | -1;
export type OrdenCorcho = 'nuevas_puntaje' | 'recientes';
export type FiltroEstadoCorcho = EstadoIdeaCorcho | 'todas';

export interface VotoCorcho {
  userId: string;
  valor: ValorVotoCorcho;
}

export interface IdeaCorchoBase {
  id: string;
  autorUserId: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoIdeaCorcho;
  comentarioEstado: string | null;
  createdAt: string;
  votos: VotoCorcho[];
  /** Si el viewer ya la marcó vista (fila en ideas_corcho_vistas). */
  vistaPorMi: boolean;
}

export function labelEstadoIdea(estado: EstadoIdeaCorcho): string {
  switch (estado) {
    case 'propuesta':
      return 'Propuesta';
    case 'aprobada':
      return 'Aprobada';
    case 'descartada':
      return 'Descartada';
    default:
      return estado;
  }
}

export function fraseEstadoIdeaNotificacion(estado: 'aprobada' | 'descartada'): string {
  return estado === 'aprobada' ? 'aprobada' : 'descartada';
}

/** Puntaje = suma de votos (👍 = +1, 👎 = −1). */
export function puntajeIdea(votos: VotoCorcho[]): number {
  return votos.reduce((acc, v) => acc + v.valor, 0);
}

export function conteoVotos(votos: VotoCorcho[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const v of votos) {
    if (v.valor === 1) up += 1;
    else if (v.valor === -1) down += 1;
  }
  return { up, down };
}

/**
 * "Nueva" = no tiene vista del viewer y no es propia (D14).
 * El cartel desaparece en la siguiente visita después de marcar vista.
 */
export function esIdeaNuevaParaMi(
  idea: Pick<IdeaCorchoBase, 'autorUserId' | 'vistaPorMi'>,
  viewerUserId: string,
): boolean {
  if (!viewerUserId) return false;
  if (idea.autorUserId === viewerUserId) return false;
  return !idea.vistaPorMi;
}

/** No se vota la idea propia ni las descartadas (S11). */
export function puedeVotarIdea(
  idea: Pick<IdeaCorchoBase, 'autorUserId' | 'estado'>,
  viewerUserId: string,
): boolean {
  if (!viewerUserId) return false;
  if (idea.autorUserId === viewerUserId) return false;
  if (idea.estado === 'descartada') return false;
  return true;
}

/**
 * Toggle de voto: mismo valor → saca; otro valor → cambia; sin voto → setea.
 * Devuelve el valor resultante o null si se saca.
 */
export function siguienteVoto(
  actual: ValorVotoCorcho | null,
  click: ValorVotoCorcho,
): ValorVotoCorcho | null {
  if (actual === click) return null;
  return click;
}

export function filtrarIdeasCorcho<T extends IdeaCorchoBase>(
  ideas: T[],
  opts: {
    viewerUserId: string;
    autorUserId?: string | null;
    estado?: FiltroEstadoCorcho;
    soloNuevas?: boolean;
  },
): T[] {
  const estado = opts.estado ?? 'todas';
  return ideas.filter((idea) => {
    if (opts.autorUserId && idea.autorUserId !== opts.autorUserId) return false;
    if (estado !== 'todas' && idea.estado !== estado) return false;
    if (opts.soloNuevas && !esIdeaNuevaParaMi(idea, opts.viewerUserId)) return false;
    return true;
  });
}

/** S12: nuevas primero, después por puntaje (desc); empate por createdAt desc. */
export function ordenarIdeasCorcho<T extends IdeaCorchoBase>(
  ideas: T[],
  viewerUserId: string,
  orden: OrdenCorcho = 'nuevas_puntaje',
): T[] {
  const copy = [...ideas];
  if (orden === 'recientes') {
    return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return copy.sort((a, b) => {
    const na = esIdeaNuevaParaMi(a, viewerUserId) ? 1 : 0;
    const nb = esIdeaNuevaParaMi(b, viewerUserId) ? 1 : 0;
    if (nb !== na) return nb - na;
    const pa = puntajeIdea(a.votos);
    const pb = puntajeIdea(b.votos);
    if (pb !== pa) return pb - pa;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function contarIdeasNuevas(
  ideas: IdeaCorchoBase[],
  viewerUserId: string,
): number {
  return ideas.filter((i) => esIdeaNuevaParaMi(i, viewerUserId)).length;
}
