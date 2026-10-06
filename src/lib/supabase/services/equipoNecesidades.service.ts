import { supabase } from '../client';

export type EstadoNecesidad = 'pendiente' | 'resuelta';

export interface NecesidadEquipo {
  id: string;
  userId: string;
  texto: string;
  estado: EstadoNecesidad;
  respuestaAdmin: string | null;
  resueltaAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type NecesidadRow = {
  id: string;
  user_id: string;
  texto: string;
  estado: string;
  respuesta_admin: string | null;
  resuelta_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  'id, user_id, texto, estado, respuesta_admin, resuelta_at, created_at, updated_at';

function mapNecesidad(row: NecesidadRow): NecesidadEquipo {
  return {
    id: row.id,
    userId: row.user_id,
    texto: row.texto,
    estado: row.estado as EstadoNecesidad,
    respuestaAdmin: row.respuesta_admin,
    resueltaAt: row.resuelta_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Pedidos del usuario logueado. */
export async function getMisNecesidades(): Promise<NecesidadEquipo[]> {
  const { data, error } = await supabase
    .from('necesidades_equipo')
    .select(SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as NecesidadRow[] | null) ?? []).map(mapNecesidad);
}

/** Bandeja admin: solo pendientes. */
export async function getNecesidadesPendientes(): Promise<NecesidadEquipo[]> {
  const { data, error } = await supabase
    .from('necesidades_equipo')
    .select(SELECT)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data as NecesidadRow[] | null) ?? []).map(mapNecesidad);
}

export async function crearNecesidad(texto: string): Promise<NecesidadEquipo> {
  const trimmed = texto.trim();
  if (!trimmed) throw new Error('El pedido no puede estar vacío');

  const { data, error } = await supabase
    .from('necesidades_equipo')
    .insert({ texto: trimmed })
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapNecesidad(data as NecesidadRow);
}

export async function actualizarNecesidadPendiente(input: {
  id: string;
  texto: string;
}): Promise<NecesidadEquipo> {
  const trimmed = input.texto.trim();
  if (!trimmed) throw new Error('El pedido no puede estar vacío');

  const { data, error } = await supabase
    .from('necesidades_equipo')
    .update({ texto: trimmed })
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapNecesidad(data as NecesidadRow);
}

export async function borrarNecesidadPendiente(id: string): Promise<void> {
  const { error } = await supabase.from('necesidades_equipo').delete().eq('id', id);
  if (error) throw error;
}

/** Solo admin (RLS). */
export async function resolverNecesidad(input: {
  id: string;
  respuestaAdmin?: string | null;
}): Promise<NecesidadEquipo> {
  const { data, error } = await supabase
    .from('necesidades_equipo')
    .update({
      estado: 'resuelta',
      respuesta_admin: input.respuestaAdmin?.trim() || null,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapNecesidad(data as NecesidadRow);
}
