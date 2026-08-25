import { supabase } from '../client';

export type AndreaniLinkEstado = 'disponible' | 'asignado' | 'descartado';

export interface AndreaniLink {
  id: string;
  url: string;
  estado: AndreaniLinkEstado;
  ordenId: string | null;
  creadoEn: string;
  asignadoEn: string | null;
  nota: string | null;
}

const mapRow = (row: {
  id: string;
  url: string;
  estado: string;
  orden_id: string | null;
  creado_en: string;
  asignado_en: string | null;
  nota: string | null;
}): AndreaniLink => ({
  id: row.id,
  url: row.url,
  estado: row.estado as AndreaniLinkEstado,
  ordenId: row.orden_id,
  creadoEn: row.creado_en,
  asignadoEn: row.asignado_en,
  nota: row.nota,
});

/** Asigna un link disponible a la orden. Null si el pool está vacío. */
export const asignarLinkAndreani = async (ordenId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('asignar_link_andreani', {
    p_orden_id: ordenId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
};

/**
 * Libera el link de la orden.
 * @param descartar si true, marca descartado (no reutilizable); si false, vuelve a disponible.
 */
export const liberarLinkAndreani = async (
  ordenId: string,
  descartar = false,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('liberar_link_andreani', {
    p_orden_id: ordenId,
    p_descartar: descartar,
    p_eliminar: false,
  });
  if (error) throw error;
  return Boolean(data);
};

/** Quita el link del pedido y lo borra de la base de datos. */
export const eliminarLinkAndreani = async (ordenId: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('liberar_link_andreani', {
    p_orden_id: ordenId,
    p_descartar: false,
    p_eliminar: true,
  });
  if (error) throw error;
  return Boolean(data);
};

/** Elimina del pool los disponibles creados hace más de 48h. */
export const purgarLinksAndreaniViejos = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('purgar_links_andreani_viejos');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
};

/** Reasigna: descarta el actual y toma uno nuevo del pool. */
export const reasignarLinkAndreani = async (ordenId: string): Promise<string | null> => {
  await liberarLinkAndreani(ordenId, true);
  return asignarLinkAndreani(ordenId);
};

export const getAssignedAndreaniLinkUrl = async (ordenId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('envios_andreani_links')
    .select('url')
    .eq('orden_id', ordenId)
    .eq('estado', 'asignado')
    .maybeSingle();
  if (error) throw error;
  return data?.url ?? null;
};

/** Mapa ordenId → url para links asignados (carga en lote de la tabla de pedidos). */
export const getAssignedAndreaniLinksByOrdenIds = async (
  ordenIds: string[],
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const ids = [...new Set(ordenIds.filter(Boolean))];
  if (!ids.length) return map;

  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('envios_andreani_links')
      .select('orden_id, url')
      .eq('estado', 'asignado')
      .in('orden_id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.orden_id && row.url) map.set(row.orden_id, row.url);
    }
  }
  return map;
};

export const getAndreaniPoolCounts = async (): Promise<Record<AndreaniLinkEstado, number>> => {
  const counts: Record<AndreaniLinkEstado, number> = {
    disponible: 0,
    asignado: 0,
    descartado: 0,
  };
  try {
    await purgarLinksAndreaniViejos();
  } catch {
    /* si la migración 48h aún no corrió, seguimos con el conteo */
  }
  const { data, error } = await supabase.from('envios_andreani_links').select('estado');
  if (error) throw error;
  for (const row of data ?? []) {
    const estado = row.estado as AndreaniLinkEstado;
    if (estado in counts) counts[estado] += 1;
  }
  return counts;
};

/** Inserta links a mano en el pool (hasta que exista el worker). */
export const insertAndreaniLinksDisponibles = async (urls: string[]): Promise<number> => {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return 0;
  const rows = unique.map((url) => ({ url, estado: 'disponible' as const }));
  const { data, error } = await supabase.from('envios_andreani_links').insert(rows).select('id');
  if (error) throw error;
  return data?.length ?? 0;
};

export const listAndreaniLinks = async (estado?: AndreaniLinkEstado): Promise<AndreaniLink[]> => {
  let q = supabase.from('envios_andreani_links').select('*').order('creado_en', { ascending: false });
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data ?? []).map(mapRow);
};
