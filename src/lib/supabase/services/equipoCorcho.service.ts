import { supabase } from '../client';
import { asegurarFilaAfectada, mapPostgrestError } from './rlsAffected';
import type { EstadoIdeaCorcho, ValorVotoCorcho, VotoCorcho } from '@/lib/equipo/corcho';

export type { EstadoIdeaCorcho, ValorVotoCorcho };

export interface IdeaCorcho {
  id: string;
  autorUserId: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoIdeaCorcho;
  estadoCambiadoPor: string | null;
  estadoCambiadoAt: string | null;
  comentarioEstado: string | null;
  createdAt: string;
  updatedAt: string;
  votos: VotoCorcho[];
  vistaPorMi: boolean;
  /** Más viejo primero. Vacío si la tabla de comentarios todavía no existe. */
  comentarios: ComentarioIdeaCorcho[];
}

export interface ComentarioIdeaCorcho {
  id: string;
  ideaId: string;
  autorUserId: string;
  texto: string;
  createdAt: string;
}

/** Tope de largo de un comentario (CHECK en `ideas_corcho_comentarios`). */
export const MAX_COMENTARIO_CORCHO = 2000;

type IdeaRow = {
  id: string;
  autor_user_id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  estado_cambiado_por: string | null;
  estado_cambiado_at: string | null;
  comentario_estado: string | null;
  created_at: string;
  updated_at: string;
};

type VotoRow = {
  idea_id: string;
  user_id: string;
  valor: number;
};

type VistaRow = {
  idea_id: string;
};

type ComentarioRow = {
  id: string;
  idea_id: string;
  autor_user_id: string;
  texto: string;
  created_at: string;
};

/** Error de PostgREST/Postgres cuando la tabla no existe (migración sin aplicar). */
function esTablaInexistente(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

const MSG_SIN_COMENTARIOS =
  'Los comentarios todavía no están activos (falta aplicar migration_equipo_corcho_v2.sql).';

const SELECT_IDEA =
  'id, autor_user_id, titulo, descripcion, estado, estado_cambiado_por, estado_cambiado_at, comentario_estado, created_at, updated_at';

function mapIdea(
  row: IdeaRow,
  votos: VotoCorcho[],
  vistaPorMi: boolean,
  comentarios: ComentarioIdeaCorcho[] = [],
): IdeaCorcho {
  return {
    id: row.id,
    autorUserId: row.autor_user_id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    estado: row.estado as EstadoIdeaCorcho,
    estadoCambiadoPor: row.estado_cambiado_por,
    estadoCambiadoAt: row.estado_cambiado_at,
    comentarioEstado: row.comentario_estado,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    votos,
    vistaPorMi,
    comentarios,
  };
}

function mapComentario(row: ComentarioRow): ComentarioIdeaCorcho {
  return {
    id: row.id,
    ideaId: row.idea_id,
    autorUserId: row.autor_user_id,
    texto: row.texto,
    createdAt: row.created_at,
  };
}

async function fetchComentariosPorIdea(
  ideaIds: string[],
): Promise<Map<string, ComentarioIdeaCorcho[]>> {
  const map = new Map<string, ComentarioIdeaCorcho[]>();
  if (ideaIds.length === 0) return map;
  const { data, error } = await supabase
    .from('ideas_corcho_comentarios')
    .select('id, idea_id, autor_user_id, texto, created_at')
    .in('idea_id', ideaIds)
    .order('created_at', { ascending: true });
  if (error) {
    // Sin la migración v2 el corcho sigue andando, sin comentarios.
    if (esTablaInexistente(error)) return map;
    throw error;
  }
  for (const row of (data as ComentarioRow[] | null) ?? []) {
    const list = map.get(row.idea_id) ?? [];
    list.push(mapComentario(row));
    map.set(row.idea_id, list);
  }
  return map;
}

/** Usuario de la sesión local (sin ir al servidor de auth como `getUser`). */
async function userIdSesion(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? '';
}

async function fetchVotosPorIdea(ideaIds: string[]): Promise<Map<string, VotoCorcho[]>> {
  const map = new Map<string, VotoCorcho[]>();
  if (ideaIds.length === 0) return map;
  const { data, error } = await supabase
    .from('ideas_corcho_votos')
    .select('idea_id, user_id, valor')
    .in('idea_id', ideaIds);
  if (error) throw error;
  for (const row of (data as VotoRow[] | null) ?? []) {
    const list = map.get(row.idea_id) ?? [];
    list.push({ userId: row.user_id, valor: row.valor as ValorVotoCorcho });
    map.set(row.idea_id, list);
  }
  return map;
}

/** EQ-R24: solo por user_id (evita `.in` enorme); cruce en memoria. */
async function fetchMisVistas(ideaIds: string[], userId: string): Promise<Set<string>> {
  const set = new Set<string>();
  if (ideaIds.length === 0 || !userId) return set;
  const wanted = new Set(ideaIds);
  const { data, error } = await supabase
    .from('ideas_corcho_vistas')
    .select('idea_id')
    .eq('user_id', userId);
  if (error) throw error;
  for (const row of (data as VistaRow[] | null) ?? []) {
    if (wanted.has(row.idea_id)) set.add(row.idea_id);
  }
  return set;
}

async function hydrateIdeas(rows: IdeaRow[]): Promise<IdeaCorcho[]> {
  const userId = await userIdSesion();
  const ids = rows.map((r) => r.id);
  const [votosMap, vistas, comentariosMap] = await Promise.all([
    fetchVotosPorIdea(ids),
    fetchMisVistas(ids, userId),
    fetchComentariosPorIdea(ids),
  ]);
  return rows.map((row) =>
    mapIdea(
      row,
      votosMap.get(row.id) ?? [],
      vistas.has(row.id),
      comentariosMap.get(row.id) ?? [],
    ),
  );
}

/** Todas las ideas del corcho (compartido) con votos y si yo ya las vi. */
export async function getIdeasCorcho(): Promise<IdeaCorcho[]> {
  const { data, error } = await supabase
    .from('ideas_corcho')
    .select(SELECT_IDEA)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return hydrateIdeas((data as IdeaRow[] | null) ?? []);
}

/** Solo las ideas del usuario logueado. */
export async function getMisIdeasCorcho(): Promise<IdeaCorcho[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  const { data, error } = await supabase
    .from('ideas_corcho')
    .select(SELECT_IDEA)
    .eq('autor_user_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return hydrateIdeas((data as IdeaRow[] | null) ?? []);
}

/** Cantidad de ideas ajenas que todavía no marqué como vistas (badge menú). */
export async function contarIdeasCorchoNuevas(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;

  const { data: ideas, error } = await supabase
    .from('ideas_corcho')
    .select('id, autor_user_id');
  if (error) throw error;

  const ajenas = ((ideas as { id: string; autor_user_id: string }[] | null) ?? []).filter(
    (i) => i.autor_user_id !== auth.user!.id,
  );
  if (ajenas.length === 0) return 0;

  const ids = ajenas.map((i) => i.id);
  const vistas = await fetchMisVistas(ids, auth.user.id);
  return ids.filter((id) => !vistas.has(id)).length;
}

export async function crearIdeaCorcho(input: {
  titulo: string;
  descripcion?: string | null;
}): Promise<IdeaCorcho> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('El título no puede estar vacío');

  const { data, error } = await supabase
    .from('ideas_corcho')
    .insert({
      titulo,
      descripcion: input.descripcion?.trim() || null,
      estado: 'propuesta',
    })
    .select(SELECT_IDEA)
    .single();
  if (error) throw error;
  return mapIdea(data as IdeaRow, [], true);
}

export async function actualizarIdeaCorcho(input: {
  id: string;
  titulo?: string;
  descripcion?: string | null;
}): Promise<IdeaCorcho> {
  const patch: Record<string, unknown> = {};
  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim();
    if (!titulo) throw new Error('El título no puede estar vacío');
    patch.titulo = titulo;
  }
  if (input.descripcion !== undefined) {
    patch.descripcion = input.descripcion?.trim() || null;
  }

  // POL-076: con votos ya no se edita (la RLS también lo frena).
  const { count, error: votosError } = await supabase
    .from('ideas_corcho_votos')
    .select('idea_id', { count: 'exact', head: true })
    .eq('idea_id', input.id);
  if (votosError) throw votosError;
  if ((count ?? 0) > 0) {
    throw new Error('Esta idea ya tiene votos: no se puede editar.');
  }

  const { data, error } = await supabase
    .from('ideas_corcho')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT_IDEA)
    .single();
  if (error) throw mapPostgrestError(error);

  const hydrated = await hydrateIdeas([asegurarFilaAfectada(data) as IdeaRow]);
  return hydrated[0]!;
}

export async function borrarIdeaCorcho(id: string): Promise<void> {
  const { data, error } = await supabase.from('ideas_corcho').delete().eq('id', id).select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** Admin: cambia estado (propuesta / aprobada / descartada) con comentario opcional. */
export async function cambiarEstadoIdeaCorcho(input: {
  id: string;
  estado: EstadoIdeaCorcho;
  comentarioEstado?: string | null;
}): Promise<IdeaCorcho> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  const { data, error } = await supabase
    .from('ideas_corcho')
    .update({
      estado: input.estado,
      estado_cambiado_por: auth.user.id,
      estado_cambiado_at: new Date().toISOString(),
      comentario_estado: input.comentarioEstado?.trim() || null,
    })
    .eq('id', input.id)
    .select(SELECT_IDEA)
    .single();
  if (error) throw mapPostgrestError(error);

  const hydrated = await hydrateIdeas([asegurarFilaAfectada(data) as IdeaRow]);
  return hydrated[0]!;
}

/**
 * Setea o saca el voto del usuario logueado.
 * `valor = null` borra el voto. No se puede votar idea propia (RLS).
 */
export async function setVotoIdeaCorcho(
  ideaId: string,
  valor: ValorVotoCorcho | null,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  if (valor === null) {
    const { error } = await supabase
      .from('ideas_corcho_votos')
      .delete()
      .eq('idea_id', ideaId)
      .eq('user_id', auth.user.id)
      .select('idea_id');
    if (error) throw mapPostgrestError(error);
    return;
  }

  const { error } = await supabase.from('ideas_corcho_votos').upsert(
    {
      idea_id: ideaId,
      user_id: auth.user.id,
      valor,
    },
    { onConflict: 'idea_id,user_id' },
  );
  if (error) throw error;
  window.dispatchEvent(new Event(EVENTO_CORCHO_VISTAS));
}

export async function crearComentarioIdeaCorcho(input: {
  ideaId: string;
  texto: string;
}): Promise<ComentarioIdeaCorcho> {
  const texto = input.texto.trim();
  if (!texto) throw new Error('El comentario está vacío');
  if (texto.length > MAX_COMENTARIO_CORCHO) {
    throw new Error(`Máximo ${MAX_COMENTARIO_CORCHO} caracteres`);
  }
  const { data, error } = await supabase
    .from('ideas_corcho_comentarios')
    .insert({ idea_id: input.ideaId, texto })
    .select('id, idea_id, autor_user_id, texto, created_at')
    .single();
  if (error) {
    if (esTablaInexistente(error)) throw new Error(MSG_SIN_COMENTARIOS);
    throw mapPostgrestError(error);
  }
  return mapComentario(data as ComentarioRow);
}

/** Borra un comentario propio (o cualquiera, si es admin). */
export async function borrarComentarioIdeaCorcho(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('ideas_corcho_comentarios')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** Evento de `window` cuando se marca una idea vista (refresca el badge del menú). */
export const EVENTO_CORCHO_VISTAS = 'corcho:vistas';

/** Marca idea como vista por el usuario logueado (cartel Nueva). Idempotente. */
export async function marcarIdeaCorchoVista(ideaId: string): Promise<void> {
  const userId = await userIdSesion();
  if (!userId) throw new Error('no autenticado');

  const { error } = await supabase.from('ideas_corcho_vistas').upsert(
    {
      idea_id: ideaId,
      user_id: userId,
      visto_at: new Date().toISOString(),
    },
    { onConflict: 'idea_id,user_id' },
  );
  if (error) throw error;
  window.dispatchEvent(new Event(EVENTO_CORCHO_VISTAS));
}
