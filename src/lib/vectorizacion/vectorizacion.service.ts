import { supabase } from '@/lib/supabase/client';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { clienteNombreFromParts } from '@/lib/notificaciones/format';
import type { PendingSello } from './types';

const firstJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

type ClienteJoin = { nombre?: string | null; apellido?: string | null };
type OrdenJoin = { id?: string; clientes?: ClienteJoin | ClienteJoin[] | null };

export async function fetchPendientes(includeRehacerPrioridad: boolean): Promise<PendingSello[]> {
  const estados = includeRehacerPrioridad ? ['Sin Hacer', 'Rehacer', 'Prioridad'] : ['Sin Hacer'];
  const { data, error } = await supabase
    .from('sellos')
    .select(
      `
      id, orden_id, diseno, item_type, item_config, archivo_base, archivo_base_mejorado,
      mockup_solicitud_id, ancho_real, largo_real, estado_fabricacion, estado_vectorizacion,
      es_prioritario, fecha_limite, created_at,
      ordenes!inner ( id, clientes ( nombre, apellido ) )
    `,
    )
    .eq('item_type', 'SELLO')
    .in('estado_fabricacion', estados)
    .or('estado_vectorizacion.is.null,estado_vectorizacion.neq.VECTORIZADO')
    .is('archivo_vector_preview', null)
    .not('archivo_base', 'is', null)
    .order('es_prioritario', { ascending: false })
    .order('fecha_limite', { ascending: true, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const orden = firstJoin(row.ordenes as OrdenJoin | OrdenJoin[] | null);
    const cliente = firstJoin(orden?.clientes ?? null);
    return {
      id: row.id as string,
      orderId: (row.orden_id as string) ?? orden?.id ?? '',
      designName: getOrderItemDisplayName({
        designName: (row.diseno as string) || '',
        itemType: (row.item_type as 'SELLO') || 'SELLO',
        itemConfig: (row.item_config as Record<string, unknown> | null) ?? undefined,
      }),
      clienteNombre: clienteNombreFromParts(cliente?.nombre, cliente?.apellido),
      archivoBase: (row.archivo_base as string) || '',
      archivoBaseMejorado: ((row as { archivo_base_mejorado?: string | null }).archivo_base_mejorado) ?? null,
      mockupSolicitudId: (row.mockup_solicitud_id as string | null) ?? null,
      requestedWidthMm: Number(row.ancho_real ?? 0) * 10,
      requestedHeightMm: Number(row.largo_real ?? 0) * 10,
      estadoFabricacion: (row.estado_fabricacion as string) || 'Sin Hacer',
      esPrioritario: Boolean(row.es_prioritario),
      fechaLimite: (row.fecha_limite as string | null) ?? null,
    };
  });
}

export async function setSelloVectorState(
  selloId: string,
  estado: 'EN_PROCESO' | 'VECTORIZADO' | 'ERROR' | 'BASE',
  extra?: { error?: string | null; vectorUrl?: string | null; widthMm?: number | null; heightMm?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = {
    estado_vectorizacion: estado,
    updated_at: new Date().toISOString(),
  };
  if (extra?.error !== undefined) patch.error_vectorizacion_mensaje = extra.error;
  if (extra?.vectorUrl) {
    patch.archivo_vector_preview = extra.vectorUrl;
    patch.error_vectorizacion_mensaje = null;
  }
  if (extra?.widthMm != null) patch.ancho_fabricacion_mm = extra.widthMm;
  if (extra?.heightMm != null) patch.largo_fabricacion_mm = extra.heightMm;
  const { error } = await supabase.from('sellos').update(patch as never).eq('id', selloId);
  if (error) throw error;
}

export async function setArchivoBaseMejorado(selloId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('sellos')
    .update({
      archivo_base_mejorado: url,
      archivo_base_mejorado_at: url ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', selloId);
  if (error) throw error;
}
