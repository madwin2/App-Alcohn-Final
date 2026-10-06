import { supabase } from '../client';
import type { EstadoObjetivo, TipoObjetivo } from '@/lib/equipo/crecimiento';

export type { EstadoObjetivo, TipoObjetivo };

export interface ObjetivoPersonal {
  id: string;
  userId: string;
  tipo: TipoObjetivo;
  titulo: string;
  descripcion: string | null;
  estado: EstadoObjetivo;
  fechaObjetivo: string | null;
  logradoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type ObjetivoRow = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  fecha_objetivo: string | null;
  logrado_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  'id, user_id, tipo, titulo, descripcion, estado, fecha_objetivo, logrado_at, created_at, updated_at';

function mapObjetivo(row: ObjetivoRow): ObjetivoPersonal {
  return {
    id: row.id,
    userId: row.user_id,
    tipo: row.tipo as TipoObjetivo,
    titulo: row.titulo,
    descripcion: row.descripcion,
    estado: row.estado as EstadoObjetivo,
    fechaObjetivo: row.fecha_objetivo,
    logradoAt: row.logrado_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Objetivos del usuario logueado (filtra en cliente: el admin también puede leer los de otros vía RLS). */
export async function getMisObjetivos(): Promise<ObjetivoPersonal[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('no autenticado');

  const { data, error } = await supabase
    .from('objetivos_personales')
    .select(SELECT)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as ObjetivoRow[] | null) ?? []).map(mapObjetivo);
}

/** Admin: objetivos de una persona (solo lectura vía RLS SELECT). */
export async function getObjetivosDeUsuario(userId: string): Promise<ObjetivoPersonal[]> {
  const { data, error } = await supabase
    .from('objetivos_personales')
    .select(SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as ObjetivoRow[] | null) ?? []).map(mapObjetivo);
}

export async function crearObjetivo(input: {
  tipo: TipoObjetivo;
  titulo: string;
  descripcion?: string | null;
  fechaObjetivo?: string | null;
  estado?: EstadoObjetivo;
}): Promise<ObjetivoPersonal> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('El título no puede estar vacío');

  const estado = input.estado ?? 'pendiente';
  const { data, error } = await supabase
    .from('objetivos_personales')
    .insert({
      tipo: input.tipo,
      titulo,
      descripcion: input.descripcion?.trim() || null,
      fecha_objetivo: input.fechaObjetivo || null,
      estado,
      logrado_at: estado === 'logrado' ? new Date().toISOString() : null,
    })
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapObjetivo(data as ObjetivoRow);
}

export async function actualizarObjetivo(input: {
  id: string;
  titulo?: string;
  descripcion?: string | null;
  estado?: EstadoObjetivo;
  fechaObjetivo?: string | null;
}): Promise<ObjetivoPersonal> {
  const patch: Record<string, unknown> = {};
  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim();
    if (!titulo) throw new Error('El título no puede estar vacío');
    patch.titulo = titulo;
  }
  if (input.descripcion !== undefined) {
    patch.descripcion = input.descripcion?.trim() || null;
  }
  if (input.fechaObjetivo !== undefined) {
    patch.fecha_objetivo = input.fechaObjetivo || null;
  }
  if (input.estado !== undefined) {
    patch.estado = input.estado;
    if (input.estado === 'logrado') {
      patch.logrado_at = new Date().toISOString();
    } else {
      patch.logrado_at = null;
    }
  }

  const { data, error } = await supabase
    .from('objetivos_personales')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapObjetivo(data as ObjetivoRow);
}

export async function borrarObjetivo(id: string): Promise<void> {
  const { error } = await supabase.from('objetivos_personales').delete().eq('id', id);
  if (error) throw error;
}
