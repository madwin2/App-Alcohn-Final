import { supabase } from '@/lib/supabase/client';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useProductionStore } from '@/lib/state/production.store';
import type { NotificacionItem } from './types';

type ClienteJoin = { telefono: string | null } | null;

/** Pantallas cuyo buscador sabe filtrar por cliente/teléfono. */
const PATHS_CON_BUSCADOR = new Set(['/pedidos', '/produccion']);

const firstJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

function ordenIdFromNotification(item: NotificacionItem): string | null {
  if (item.entidadTipo === 'orden' && item.entidadId) return item.entidadId;
  return item.metadata.ordenId ?? null;
}

async function ordenIdFromSello(selloId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sellos')
    .select('orden_id')
    .eq('id', selloId)
    .maybeSingle();
  if (error) return null;
  return (data?.orden_id as string | undefined) ?? null;
}

async function telefonoDeOrden(ordenId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('clientes ( telefono )')
    .eq('id', ordenId)
    .maybeSingle();
  if (error || !data) return null;
  const cliente = firstJoin((data as { clientes: ClienteJoin | ClienteJoin[] }).clientes);
  return cliente?.telefono?.trim() || null;
}

/**
 * Deja la tabla de destino buscando el cliente de la notificación: el teléfono
 * en el buscador (y "Toda la base" en Pedidos, para que también aparezcan los
 * pedidos viejos), así queda a la vista solo lo que avisó la notificación. Si no
 * hay teléfono, cae al nombre del cliente.
 */
export async function prepararBusquedaDePedido(item: NotificacionItem): Promise<void> {
  const path = item.linkPath?.split('?')[0];
  if (!path || !PATHS_CON_BUSCADOR.has(path)) return;

  let ordenId = ordenIdFromNotification(item);
  if (!ordenId && item.entidadTipo === 'sello' && item.entidadId) {
    ordenId = await ordenIdFromSello(item.entidadId);
  }

  const telefono = ordenId ? await telefonoDeOrden(ordenId) : null;
  const termino = telefono || item.metadata.clienteNombre?.trim() || '';
  if (!termino) return;

  if (path === '/pedidos') {
    const { setSearchQuery, setSearchAcrossDatabase } = useOrdersStore.getState();
    setSearchQuery(termino);
    setSearchAcrossDatabase(true);
    return;
  }

  useProductionStore.getState().setSearchQuery(termino);
}
