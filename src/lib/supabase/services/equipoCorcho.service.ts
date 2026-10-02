import { supabase } from '../client';
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
}

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

const SELECT_IDEA =
  'id, autor_user_id, titulo, descripcion, estado, estado_cambiado_por, estado_cambiado_at, comentario_estado, created_at, updated_at';

function mapIdea(
  row: IdeaRow,
  votos: VotoCorcho[],
  vistaPorMi: boolean,
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
  };
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

async function fetchMisVistas(ideaIds: string[], userId: string): Promise<Set<string>> {
  const set = new Set<string>();
  if (ideaIds.length === 0 || !userId) return set;
  const { data, error } = await supabase
    .from('ideas_corcho_vistas')
    .select('idea_id')
    .eq('user_id', userId)
    .in('idea_id', ideaIds);
  if (error) throw error;
  for (const row of (data as VistaRow[] | null) ?? []) {
    set.add(row.idea_id);
  }
  return set;
}

async function hydrateIdeas(rows: IdeaRow[]): Promise<IdeaCorcho[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? '';
  const ids = rows.map((r) => r.id);
  const [votosMap, vistas] = await Promise.all([
    fetchVotosPorIdea(ids),
    fetchMisVistas(ids, userId),
  ]);
  return rows.map((row) =>
    mapIdea(row, votosMap.get(row.id) ?? [], vistas.has(row.id)),
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

  const { data, error } = await supabase
    .from('ideas_corcho')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT_IDEA)
    .single();
  if (error) throw error;

  const hydrated = await hydrateIdeas([data as IdeaRow]);
  return hydrated[0]!;
}

export async function borrarIdeaCorcho(id: string): Promise<void> {
  const { error } = await supabase.from('ideas_corcho').delete().eq('id', id);
  if (error) throw error;
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
  if (error) throw error;

  const hydrated = await hydrateIdeas([data as IdeaRow]);
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
      .eq('user_id', auth.user.id);
    if (error) throw error;
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
}

/** Marca idea como vista por el usuario logueado (cartel Nueva). Idempotente. */
export async function marcarIdeaCorchoVista(ideaId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  const { error } = await supabase.from('ideas_corcho_vistas').upsert(
    {
      idea_id: ideaId,
      user_id: auth.user.id,
      visto_at: new Date().toISOString(),
    },
    { onConflict: 'idea_id,user_id' },
  );
  if (error) throw error;
}
