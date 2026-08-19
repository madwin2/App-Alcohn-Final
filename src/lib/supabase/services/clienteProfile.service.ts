import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import type { ItemType } from '@/lib/types/index';
import { supabase } from '../client';
import type { Database } from '../types';
import { isWebOrderHiddenFromInternalApp } from './orders.service';

type ClienteRow = Database['public']['Tables']['clientes']['Row'];
type OrdenRow = Database['public']['Tables']['ordenes']['Row'];
type SelloRow = Database['public']['Tables']['sellos']['Row'];
type DireccionRow = Database['public']['Tables']['direcciones']['Row'];

const SELLOS_IN_QUERY_CHUNK = 150;

export type ClienteProfileShipping = {
  recipientName: string;
  phone: string | null;
  dni: string | null;
  domicilio: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  sucursal: string | null;
};

export type ClienteProfileItem = {
  id: string;
  name: string;
  tipo: string | null;
  estadoFabricacion: string | null;
  estadoVenta: string | null;
  nota: string | null;
};

export type ClienteProfileOrder = {
  id: string;
  fecha: string | null;
  origen: string | null;
  valorTotal: number;
  seniaTotal: number;
  restante: number;
  empresaEnvio: string | null;
  tipoEnvio: string | null;
  estadoEnvio: string | null;
  seguimiento: string | null;
  items: ClienteProfileItem[];
  shipping: ClienteProfileShipping | null;
};

export type ClienteProfile = {
  cliente: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    dni: string | null;
    medioContacto: string | null;
    createdAt: string | null;
  };
  orders: ClienteProfileOrder[];
  stats: {
    pedidosCount: number;
    totalFacturado: number;
    saldoPendiente: number;
    ultimoPedido: string | null;
  };
};

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatRecipient(dir: DireccionRow): string {
  const name = [dir.nombre, dir.apellido].filter(Boolean).join(' ').trim();
  return name || 'Sin destinatario';
}

function mapShipping(dir: DireccionRow | undefined): ClienteProfileShipping | null {
  if (!dir) return null;
  return {
    recipientName: formatRecipient(dir),
    phone: dir.telefono,
    dni: dir.dni,
    domicilio: dir.domicilio || '',
    localidad: dir.localidad || '',
    provincia: dir.provincia || '',
    codigoPostal: dir.codigo_postal || '',
    sucursal: dir.codigo_sucursal_micorreo,
  };
}

function mapItem(sello: SelloRow): ClienteProfileItem {
  const itemType = (sello.item_type as ItemType | null) ?? undefined;
  const name = getOrderItemDisplayName({
    designName: sello.diseno || '',
    itemType,
    itemConfig: sello.item_config as { soldadorPower?: '100W' | '200W' } | undefined,
  });
  return {
    id: sello.id,
    name,
    tipo: sello.tipo,
    estadoFabricacion: sello.estado_fabricacion,
    estadoVenta: sello.estado_venta,
    nota: sello.nota,
  };
}

export async function fetchClienteProfile(clienteId: string): Promise<ClienteProfile> {
  const [clienteRes, ordenesRes] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle(),
    supabase
      .from('ordenes')
      .select(
        'id, fecha, origen, valor_total, senia_total, restante, empresa_envio, tipo_envio, estado_envio, seguimiento, direccion_id, estado_pago_web',
      )
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false }),
  ]);

  if (clienteRes.error) throw new Error(clienteRes.error.message);
  if (ordenesRes.error) throw new Error(ordenesRes.error.message);
  if (!clienteRes.data) throw new Error('No se encontró el cliente');

  const cliente = clienteRes.data as ClienteRow;
  const ordenes = ((ordenesRes.data ?? []) as OrdenRow[]).filter(
    (orden) => !isWebOrderHiddenFromInternalApp(orden),
  );

  const ordenIds = ordenes.map((o) => o.id);
  const direccionIds = [
    ...new Set(ordenes.map((o) => o.direccion_id).filter((id): id is string => Boolean(id))),
  ];

  const sellos: SelloRow[] = [];
  for (let i = 0; i < ordenIds.length; i += SELLOS_IN_QUERY_CHUNK) {
    const chunk = ordenIds.slice(i, i + SELLOS_IN_QUERY_CHUNK);
    const { data, error } = await supabase
      .from('sellos')
      .select('id, orden_id, diseno, tipo, item_type, item_config, estado_fabricacion, estado_venta, nota')
      .in('orden_id', chunk);
    if (error) throw new Error(error.message);
    if (data?.length) sellos.push(...(data as SelloRow[]));
  }

  const direccionesById = new Map<string, DireccionRow>();
  if (direccionIds.length > 0) {
    const { data, error } = await supabase.from('direcciones').select('*').in('id', direccionIds);
    if (error) throw new Error(error.message);
    for (const dir of (data ?? []) as DireccionRow[]) {
      direccionesById.set(dir.id, dir);
    }
  }

  const sellosByOrden = new Map<string, SelloRow[]>();
  for (const sello of sellos) {
    const list = sellosByOrden.get(sello.orden_id) ?? [];
    list.push(sello);
    sellosByOrden.set(sello.orden_id, list);
  }

  const orders: ClienteProfileOrder[] = ordenes.map((orden) => ({
    id: orden.id,
    fecha: orden.fecha,
    origen: orden.origen ?? null,
    valorTotal: toNumber(orden.valor_total),
    seniaTotal: toNumber(orden.senia_total),
    restante: toNumber(orden.restante),
    empresaEnvio: orden.empresa_envio,
    tipoEnvio: orden.tipo_envio,
    estadoEnvio: orden.estado_envio,
    seguimiento: orden.seguimiento,
    items: (sellosByOrden.get(orden.id) ?? []).map(mapItem),
    shipping: orden.direccion_id ? mapShipping(direccionesById.get(orden.direccion_id)) : null,
  }));

  const totalFacturado = orders.reduce((sum, order) => sum + order.valorTotal, 0);
  const saldoPendiente = orders.reduce((sum, order) => sum + order.restante, 0);

  return {
    cliente: {
      id: cliente.id,
      firstName: cliente.nombre || '',
      lastName: cliente.apellido || '',
      phone: cliente.telefono || '',
      email: cliente.mail,
      dni: cliente.dni,
      medioContacto: cliente.medio_contacto,
      createdAt: cliente.created_at,
    },
    orders,
    stats: {
      pedidosCount: orders.length,
      totalFacturado,
      saldoPendiente,
      ultimoPedido: orders[0]?.fecha ?? null,
    },
  };
}
