export type EstadoIdeaCorcho = 'propuesta' | 'aprobada' | 'descartada';
export type ValorVotoCorcho = 1 | -1;
export type OrdenCorcho = 'nuevas_puntaje' | 'recientes';
/** `activas` = propuestas + aprobadas (default: las descartadas se esconden, POL-078). */
export type FiltroEstadoCorcho = EstadoIdeaCorcho | 'activas' | 'todas';

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
 * El autor edita su idea solo mientras es propuesta y nadie la votó (POL-076):
 * así nadie termina votando algo distinto de lo que leyó.
 */
export function puedeEditarIdea(
  idea: Pick<IdeaCorchoBase, 'autorUserId' | 'estado' | 'votos'>,
  viewerUserId: string,
): boolean {
  if (!viewerUserId || idea.autorUserId !== viewerUserId) return false;
  return idea.estado === 'propuesta' && idea.votos.length === 0;
}

/** El autor borra su idea mientras es propuesta (RLS `ideas_delete`). */
export function puedeBorrarIdea(
  idea: Pick<IdeaCorchoBase, 'autorUserId' | 'estado'>,
  viewerUserId: string,
): boolean {
  if (!viewerUserId || idea.autorUserId !== viewerUserId) return false;
  return idea.estado === 'propuesta';
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
    /**
     * Qué cuenta como "Nueva". Por defecto, lo que dice la base; el tablero pasa
     * las "Nueva" de la sesión para que filtro, orden y cartel coincidan.
     */
    esNueva?: (idea: T) => boolean;
  },
): T[] {
  const estado = opts.estado ?? 'todas';
  const esNueva = opts.esNueva ?? ((i: T) => esIdeaNuevaParaMi(i, opts.viewerUserId));
  return ideas.filter((idea) => {
    if (opts.autorUserId && idea.autorUserId !== opts.autorUserId) return false;
    if (estado === 'activas' && idea.estado === 'descartada') return false;
    if (estado !== 'todas' && estado !== 'activas' && idea.estado !== estado) return false;
    if (opts.soloNuevas && !esNueva(idea)) return false;
    return true;
  });
}

/** S12: nuevas primero, después por puntaje (desc); empate por createdAt desc. */
export function ordenarIdeasCorcho<T extends IdeaCorchoBase>(
  ideas: T[],
  viewerUserId: string,
  orden: OrdenCorcho = 'nuevas_puntaje',
  /** Igual que en `filtrarIdeasCorcho`: las "Nueva" de la sesión. */
  esNueva: (idea: T) => boolean = (i) => esIdeaNuevaParaMi(i, viewerUserId),
): T[] {
  const copy = [...ideas];
  if (orden === 'recientes') {
    return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return copy.sort((a, b) => {
    const na = esNueva(a) ? 1 : 0;
    const nb = esNueva(b) ? 1 : 0;
    if (nb !== na) return nb - na;
    const pa = puntajeIdea(a.votos);
    const pb = puntajeIdea(b.votos);
    if (pb !== pa) return pb - pa;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Recarga silenciosa del corcho (Realtime): conserva las "Nueva" de la sesión
 * que siguen existiendo y suma las ideas que aparecieron desde la lista anterior
 * y son nuevas para mí (EQ-R12). Una idea que ya estaba en la lista y que
 * todavía no era "Nueva de sesión" no se agrega (ya la vi / es mía).
 */
export function mergeNuevasSesion(opts: {
  nuevasSesion: ReadonlySet<string>;
  idsAnteriores: ReadonlySet<string> | readonly string[];
  ideas: Pick<IdeaCorchoBase, 'id' | 'autorUserId' | 'vistaPorMi'>[];
  viewerUserId: string;
}): Set<string> {
  const previos =
    opts.idsAnteriores instanceof Set
      ? opts.idsAnteriores
      : new Set(opts.idsAnteriores as readonly string[]);
  const next = new Set<string>();
  for (const idea of opts.ideas) {
    if (opts.nuevasSesion.has(idea.id)) {
      next.add(idea.id);
      continue;
    }
    if (!previos.has(idea.id) && esIdeaNuevaParaMi(idea, opts.viewerUserId)) {
      next.add(idea.id);
    }
  }
  return next;
}

export function contarIdeasNuevas(
  ideas: IdeaCorchoBase[],
  viewerUserId: string,
): number {
  return ideas.filter((i) => esIdeaNuevaParaMi(i, viewerUserId)).length;
}

const TZ_AR = 'America/Argentina/Buenos_Aires';

/** Fecha corta en hora Argentina: "3 oct" (o "3 oct 2025" si no es este año). */
export function fechaCortaCorcho(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const anio = (x: Date) =>
    new Intl.DateTimeFormat('es-AR', { year: 'numeric', timeZone: TZ_AR }).format(x);
  return d
    .toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      ...(anio(d) !== anio(ahora) ? { year: 'numeric' } : {}),
      timeZone: TZ_AR,
    })
    .replace('.', '');
}

/** "recién", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o la fecha corta. */
export function fechaRelativaCorcho(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fechaCortaCorcho(iso, ahora);
}
