import { supabase } from '../client';
import type { ReworkCharge } from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { invokeBotWebhook } from './botWebhook.service';

export const REHACER_MOTIVOS = [
  'ERROR_DETECTADO_EN_MAQUINA',
  'ERROR_MEDIDA_O_VECTOR',
  'RECLAMO_CLIENTE_PRE_ENTREGA',
  'DANIO_O_ERROR_EN_ENVIO',
  'RECLAMO_CLIENTE_POST_ENTREGA',
  'OTRO',
] as const;

export type RehacerMotivo = (typeof REHACER_MOTIVOS)[number];

export const REHACER_MOTIVO_LABELS: Record<RehacerMotivo, string> = {
  ERROR_DETECTADO_EN_MAQUINA: 'Error detectado en máquina',
  ERROR_MEDIDA_O_VECTOR: 'Error de medida o vector',
  RECLAMO_CLIENTE_PRE_ENTREGA: 'Reclamo del cliente (antes de entregar)',
  DANIO_O_ERROR_EN_ENVIO: 'Daño o error en el envío',
  RECLAMO_CLIENTE_POST_ENTREGA: 'Reclamo del cliente (después de entregar)',
  OTRO: 'Otro',
};

const ORDERS_IN_QUERY_CHUNK_SIZE = 150;

export interface RehacerContexto {
  selloId: string;
  ordenId: string;
  disenoNombre: string;
  clienteNombre: string | null;
  fabricacionEstado: string;
  ventaEstado: string;
  envioEstado: string | null;
  seguimiento: string | null;
  empresaEnvio: string | null;
  seguimientoEnviadoAt: string | null;
  cantidadItemsEnPedido: number;
}

export interface RehacerEvento {
  id: string;
  selloId: string;
  motivo: string;
  descripcion: string | null;
  createdAt: string;
  cobroMonto: number | null;
  cobroConcepto: string | null;
}

type ClienteJoin = { nombre: string | null; apellido: string | null } | null;

type OrdenJoin = {
  estado_envio: string | null;
  seguimiento: string | null;
  empresa_envio: string | null;
  seguimiento_enviado_at: string | null;
  clientes: ClienteJoin | ClienteJoin[] | null;
} | null;

const firstJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

export async function fetchRehacerContexto(selloIds: string[]): Promise<RehacerContexto[]> {
  if (!selloIds.length) return [];

  const { data, error } = await supabase
    .from('sellos')
    .select(
      `
      id, orden_id, diseno, item_type, item_config, estado_fabricacion, estado_venta,
      ordenes (
        estado_envio, seguimiento, empresa_envio, seguimiento_enviado_at,
        clientes ( nombre, apellido )
      )
    `,
    )
    .in('id', selloIds);
  if (error) throw error;

  const rows = data ?? [];
  const ordenIds = [...new Set(rows.map((r) => r.orden_id as string).filter(Boolean))];
  const countByOrden = new Map<string, number>();
  if (ordenIds.length) {
    const { data: countRows, error: countError } = await supabase
      .from('sellos')
      .select('orden_id')
      .in('orden_id', ordenIds);
    if (countError) throw countError;
    for (const row of countRows ?? []) {
      const id = row.orden_id as string;
      countByOrden.set(id, (countByOrden.get(id) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const orden = firstJoin(row.ordenes as OrdenJoin | OrdenJoin[]);
    const cliente = firstJoin(orden?.clientes);
    const clienteNombre = cliente
      ? `${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`.trim() || null
      : null;
    return {
      selloId: row.id as string,
      ordenId: row.orden_id as string,
      disenoNombre: getOrderItemDisplayName({
        designName: (row.diseno as string) || '',
        itemType: (row.item_type as 'SELLO') || 'SELLO',
        itemConfig: (row.item_config as Record<string, unknown> | null) ?? undefined,
      }),
      clienteNombre,
      fabricacionEstado: (row.estado_fabricacion as string) || '',
      ventaEstado: (row.estado_venta as string) || 'Señado',
      envioEstado: orden?.estado_envio ?? null,
      seguimiento: orden?.seguimiento ?? null,
      empresaEnvio: orden?.empresa_envio ?? null,
      seguimientoEnviadoAt: orden?.seguimiento_enviado_at ?? null,
      cantidadItemsEnPedido: countByOrden.get(row.orden_id as string) ?? 1,
    };
  });
}

export interface RegistrarRehacerInput {
  selloIds: string[];
  motivo: string;
  descripcion: string;
  cobroMonto?: number | null;
  cobroConcepto?: string | null;
}

export async function registrarRehacer(input: RegistrarRehacerInput): Promise<void> {
  const { error } = await supabase.rpc('registrar_rehacer', {
    p_sello_ids: input.selloIds,
    p_motivo: input.motivo,
    p_descripcion: input.descripcion?.trim() || null,
    p_cobro_monto: input.cobroMonto ?? null,
    p_cobro_concepto: input.cobroConcepto?.trim() || null,
  });
  if (error) throw error;
  void notifySellosRehacer(input.selloIds);
}

async function notifySellosRehacer(selloIds: string[]): Promise<void> {
  if (!selloIds.length) return;
  try {
    const { data, error } = await supabase
      .from('sellos')
      .select(
        `
        id, diseno, item_type, orden_id,
        ordenes (
          clientes ( nombre, apellido, telefono )
        )
      `,
      )
      .in('id', selloIds);
    if (error) throw error;

    type ClienteJoin = { nombre: string | null; apellido: string | null; telefono: string | null } | null;
    type OrdenJoin = { clientes: ClienteJoin | ClienteJoin[] | null } | null;

    const byOrden = new Map<
      string,
      Array<{
        id: string;
        cliente: { nombre: string | null; apellido: string | null; telefono: string | null } | null;
      }>
    >();

    for (const row of data ?? []) {
      const ordenId = row.orden_id as string;
      if (!ordenId) continue;
      const orden = firstJoin(row.ordenes as OrdenJoin | OrdenJoin[]);
      const cliente = firstJoin(orden?.clientes);
      const list = byOrden.get(ordenId) ?? [];
      list.push({ id: row.id as string, cliente });
      byOrden.set(ordenId, list);
    }

    for (const [ordenId, rows] of byOrden) {
      const cliente = rows[0]?.cliente;
      const nombre = cliente
        ? `${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`.trim() || 'Cliente'
        : 'Cliente';
      await invokeBotWebhook({
        numeroTelefono: cliente?.telefono,
        tipo: 'sello_rehacer',
        nombre,
        datos: {
          numero_pedido: ordenId,
          sello_ids: rows.map((r) => r.id),
        },
      });
    }
  } catch (error) {
    console.error('Error sending sello_rehacer webhook:', error);
  }
}

const mapReworkCharge = (row: {
  id: string;
  sello_id: string;
  motivo: string;
  descripcion: string | null;
  cobro_adicional_monto: number | string | null;
  cobro_adicional_concepto: string | null;
  cobro_adicional_cobrado: boolean;
  created_at: string;
}): ReworkCharge => ({
  id: row.id,
  selloId: row.sello_id,
  motivo: row.motivo,
  descripcion: row.descripcion,
  monto: Number(row.cobro_adicional_monto ?? 0),
  concepto: row.cobro_adicional_concepto,
  cobrado: row.cobro_adicional_cobrado,
  createdAt: row.created_at,
});

export async function fetchReworkChargesForOrders(
  ordenIds: string[],
): Promise<Map<string, ReworkCharge[]>> {
  const result = new Map<string, ReworkCharge[]>();
  if (!ordenIds.length) return result;

  for (let i = 0; i < ordenIds.length; i += ORDERS_IN_QUERY_CHUNK_SIZE) {
    const chunk = ordenIds.slice(i, i + ORDERS_IN_QUERY_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('sello_rehacer_eventos')
      .select(
        'id, orden_id, sello_id, motivo, descripcion, cobro_adicional_monto, cobro_adicional_concepto, cobro_adicional_cobrado, created_at',
      )
      .in('orden_id', chunk)
      .not('cobro_adicional_monto', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    for (const row of data ?? []) {
      const ordenId = row.orden_id as string;
      const list = result.get(ordenId) ?? [];
      list.push(mapReworkCharge(row));
      result.set(ordenId, list);
    }
  }

  return result;
}

export async function markReworkChargeCollected(eventId: string, cobrado: boolean): Promise<void> {
  const { error } = await supabase
    .from('sello_rehacer_eventos')
    .update({ cobro_adicional_cobrado: cobrado })
    .eq('id', eventId);
  if (error) throw error;
}

export async function fetchRehacerHistorialPorSello(selloId: string): Promise<RehacerEvento[]> {
  const { data, error } = await supabase
    .from('sello_rehacer_eventos')
    .select('id, sello_id, motivo, descripcion, cobro_adicional_monto, cobro_adicional_concepto, created_at')
    .eq('sello_id', selloId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    selloId: row.sello_id as string,
    motivo: row.motivo as string,
    descripcion: (row.descripcion as string | null) ?? null,
    createdAt: row.created_at as string,
    cobroMonto: row.cobro_adicional_monto != null ? Number(row.cobro_adicional_monto) : null,
    cobroConcepto: (row.cobro_adicional_concepto as string | null) ?? null,
  }));
}
