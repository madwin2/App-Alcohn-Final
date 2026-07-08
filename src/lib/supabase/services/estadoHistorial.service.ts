import { supabase } from '../client';
import type { Database } from '../types';

export type EstadoHistorialCampo =
  Database['public']['Tables']['estado_historial']['Row']['campo'];

export type EstadoHistorialRow = Database['public']['Tables']['estado_historial']['Row'];

export type EstadoHistorialEntry = {
  id: string;
  ordenId: string;
  selloId: string | null;
  campo: EstadoHistorialCampo;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  changedAt: string;
};

function mapRow(row: EstadoHistorialRow): EstadoHistorialEntry {
  return {
    id: row.id,
    ordenId: row.orden_id,
    selloId: row.sello_id,
    campo: row.campo,
    estadoAnterior: row.estado_anterior,
    estadoNuevo: row.estado_nuevo,
    changedAt: row.changed_at,
  };
}

/**
 * Timeline de cambios de estado de una orden (fabricación, venta, envío).
 * Ordenado del más reciente al más antiguo.
 */
export async function getEstadoHistorialByOrdenId(
  ordenId: string,
  options?: { campo?: EstadoHistorialCampo; limit?: number },
): Promise<EstadoHistorialEntry[]> {
  let query = supabase
    .from('estado_historial')
    .select('id, orden_id, sello_id, campo, estado_anterior, estado_nuevo, changed_at')
    .eq('orden_id', ordenId)
    .order('changed_at', { ascending: false });

  if (options?.campo) {
    query = query.eq('campo', options.campo);
  }
  if (options?.limit != null && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as EstadoHistorialRow));
}

/**
 * Timeline de un sello concreto (fabricación / venta a nivel ítem).
 */
export async function getEstadoHistorialBySelloId(
  selloId: string,
  options?: { campo?: EstadoHistorialCampo; limit?: number },
): Promise<EstadoHistorialEntry[]> {
  let query = supabase
    .from('estado_historial')
    .select('id, orden_id, sello_id, campo, estado_anterior, estado_nuevo, changed_at')
    .eq('sello_id', selloId)
    .order('changed_at', { ascending: false });

  if (options?.campo) {
    query = query.eq('campo', options.campo);
  }
  if (options?.limit != null && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as EstadoHistorialRow));
}
