import { supabase } from '../client';
import type { TipoFeedback } from '@/lib/equipo/feedback';

export type { TipoFeedback };

export interface FeedbackEquipo {
  id: string;
  paraUserId: string;
  autorUserId: string;
  tipo: TipoFeedback;
  titulo: string | null;
  texto: string;
  leidoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type FeedbackRow = {
  id: string;
  para_user_id: string;
  autor_user_id: string;
  tipo: string;
  titulo: string | null;
  texto: string;
  leido_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  'id, para_user_id, autor_user_id, tipo, titulo, texto, leido_at, created_at, updated_at';

function mapFeedback(row: FeedbackRow): FeedbackEquipo {
  return {
    id: row.id,
    paraUserId: row.para_user_id,
    autorUserId: row.autor_user_id,
    tipo: row.tipo as TipoFeedback,
    titulo: row.titulo,
    texto: row.texto,
    leidoAt: row.leido_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Feedback dirigido al usuario logueado (filtra: el admin también puede leer el de otros vía RLS). */
export async function getMiFeedback(): Promise<FeedbackEquipo[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  const { data, error } = await supabase
    .from('feedback_equipo')
    .select(SELECT)
    .eq('para_user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as FeedbackRow[] | null) ?? []).map(mapFeedback);
}

/** Admin: feedback de una persona. */
export async function getFeedbackDeUsuario(paraUserId: string): Promise<FeedbackEquipo[]> {
  const { data, error } = await supabase
    .from('feedback_equipo')
    .select(SELECT)
    .eq('para_user_id', paraUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as FeedbackRow[] | null) ?? []).map(mapFeedback);
}

export async function contarMiFeedbackNoLeido(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;

  const { count, error } = await supabase
    .from('feedback_equipo')
    .select('id', { count: 'exact', head: true })
    .eq('para_user_id', auth.user.id)
    .is('leido_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function crearFeedback(input: {
  paraUserId: string;
  tipo: TipoFeedback;
  titulo?: string | null;
  texto: string;
}): Promise<FeedbackEquipo> {
  const texto = input.texto.trim();
  if (!texto) throw new Error('El texto no puede estar vacío');

  const { data, error } = await supabase
    .from('feedback_equipo')
    .insert({
      para_user_id: input.paraUserId,
      tipo: input.tipo,
      titulo: input.titulo?.trim() || null,
      texto,
    })
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapFeedback(data as FeedbackRow);
}

export async function actualizarFeedback(input: {
  id: string;
  tipo?: TipoFeedback;
  titulo?: string | null;
  texto?: string;
}): Promise<FeedbackEquipo> {
  const patch: Record<string, unknown> = {};
  if (input.tipo !== undefined) patch.tipo = input.tipo;
  if (input.titulo !== undefined) patch.titulo = input.titulo?.trim() || null;
  if (input.texto !== undefined) {
    const texto = input.texto.trim();
    if (!texto) throw new Error('El texto no puede estar vacío');
    patch.texto = texto;
  }

  const { data, error } = await supabase
    .from('feedback_equipo')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapFeedback(data as FeedbackRow);
}

export async function borrarFeedback(id: string): Promise<void> {
  const { error } = await supabase.from('feedback_equipo').delete().eq('id', id);
  if (error) throw error;
}

/** Destinatario: RPC SECURITY DEFINER (no puede editar el texto). */
export async function marcarFeedbackLeido(id: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_feedback_leido', { p_id: id });
  if (error) throw error;
}
