import {
  clearNotificacionDedup,
  emitNotificacionSafe,
} from '@/lib/supabase/services/notificaciones.service';
import { clienteNombreFromParts, formatMoneyArs, joinCampos, shortPedidoId } from './format';

export function notifySelloModificado(params: {
  ordenId: string;
  clienteNombre: string;
  items: Array<{
    selloId: string;
    diseno: string;
    campos: string[];
    estadoFabricacion: string;
  }>;
}): void {
  const { ordenId, clienteNombre, items } = params;
  if (!items.length) return;
  const pedido = shortPedidoId(ordenId);
  const cliente = clienteNombre || 'Cliente';

  if (items.length === 1) {
    const item = items[0];
    const campos = joinCampos(item.campos);
    emitNotificacionSafe({
      tipo: 'p1_sello_modificado',
      area: 'produccion',
      titulo: `Se modificó ${campos} del sello de ${cliente} — pedido #${pedido} (estaba en ${item.estadoFabricacion})`,
      cuerpo: item.diseno,
      entidadTipo: 'sello',
      entidadId: item.selloId,
      linkPath: '/produccion',
      metadata: {
        clienteNombre: cliente,
        diseno: item.diseno,
        ordenId,
        campos: item.campos,
      },
    });
    return;
  }

  const todosCampos = [...new Set(items.flatMap((i) => i.campos))];
  emitNotificacionSafe({
    tipo: 'p1_sello_modificado',
    area: 'produccion',
    titulo: `Se modificó ${joinCampos(todosCampos)} de ${items.length} sellos de ${cliente} — pedido #${pedido}`,
    entidadTipo: 'orden',
    entidadId: ordenId,
    linkPath: '/produccion',
    metadata: { clienteNombre: cliente, ordenId, campos: todosCampos },
  });
}

export function notifyPrioridad(params: {
  ordenId: string;
  clienteNombre: string;
  diseno: string;
  selloId: string;
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  emitNotificacionSafe({
    tipo: 'p3_prioridad',
    area: 'produccion',
    titulo: `${cliente} — ${params.diseno} pasó a prioritario`,
    entidadTipo: 'sello',
    entidadId: params.selloId,
    linkPath: '/produccion',
    metadata: { clienteNombre: cliente, diseno: params.diseno, ordenId: params.ordenId },
  });
}

export function notifyRehacer(params: {
  selloIds: string[];
  ordenId: string;
  clienteNombre: string;
  disenos: string[];
  motivo: string;
  descripcion: string;
  cobroMonto?: number | null;
  cobroConcepto?: string | null;
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const motivo = params.motivo;
  const diseno =
    params.disenos.length === 1
      ? params.disenos[0]
      : `${params.disenos.length} sellos`;
  const cuerpoParts = [params.descripcion?.trim()].filter(Boolean);
  if (params.cobroMonto != null && params.cobroMonto > 0) {
    const cobro = `${formatMoneyArs(params.cobroMonto)}${
      params.cobroConcepto ? ` (${params.cobroConcepto})` : ''
    }`;
    cuerpoParts.push(`Cobro adicional: ${cobro}`);
  }
  const cuerpo = cuerpoParts.join(' · ') || null;

  emitNotificacionSafe({
    tipo: 'p2_rehacer',
    area: 'produccion',
    titulo: `${cliente} — ${diseno}: Rehacer por ${motivo}`,
    cuerpo: params.descripcion?.trim() || null,
    entidadTipo: params.selloIds.length === 1 ? 'sello' : 'orden',
    entidadId: params.selloIds.length === 1 ? params.selloIds[0] : params.ordenId,
    linkPath: '/produccion',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      diseno,
      ordenId: params.ordenId,
      motivo: params.motivo,
    },
  });

  emitNotificacionSafe({
    tipo: 'v2_rehacer',
    area: 'ventas',
    titulo: `${cliente} — ${diseno}: Rehacer por ${motivo}`,
    cuerpo,
    entidadTipo: params.selloIds.length === 1 ? 'sello' : 'orden',
    entidadId: params.selloIds.length === 1 ? params.selloIds[0] : params.ordenId,
    linkPath: '/pedidos',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      diseno,
      ordenId: params.ordenId,
      motivo: params.motivo,
    },
  });
}

export function notifyStockBajo(params: { itemKey: string; itemName: string; shortage: number }): void {
  emitNotificacionSafe({
    tipo: 'p6_stock_bajo',
    area: 'produccion',
    titulo: `Falta stock de ${params.itemName} para cubrir pedidos pendientes`,
    cuerpo: `Faltan ${params.shortage} unidades`,
    entidadTipo: 'insumo',
    entidadId: params.itemKey,
    linkPath: '/stock',
    severidad: 'warning',
    includeAutor: false,
    dedupKey: `p6:${params.itemKey}`,
    metadata: { itemNombre: params.itemName },
  });
}

export function notifyStockBajoResuelto(itemKey: string): void {
  void clearNotificacionDedup(`p6:${itemKey}`);
}

export function notifyDireccionPostEtiqueta(params: {
  ordenId: string;
  clienteNombre: string;
  variant: 'address' | 'duplicate';
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const pedido = shortPedidoId(params.ordenId);
  const isAddress = params.variant === 'address';
  emitNotificacionSafe({
    tipo: isAddress ? 'l1_direccion_post_etiqueta' : 'l1_etiqueta_duplicada',
    area: 'logistica',
    titulo: isAddress
      ? `${cliente} — pedido #${pedido}: la dirección cambió después de generar la etiqueta`
      : `${cliente} — pedido #${pedido}: se generó la etiqueta de Correo Argentino dos veces`,
    entidadTipo: 'orden',
    entidadId: params.ordenId,
    linkPath: '/envios',
    severidad: 'warning',
    metadata: { clienteNombre: cliente, ordenId: params.ordenId },
  });
}

export function notifyItemAgregadoPedidoPagado(params: {
  ordenId: string;
  clienteNombre: string;
  itemNombre: string;
  estado: 'pagado' | 'con foto enviada';
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const pedido = shortPedidoId(params.ordenId);
  emitNotificacionSafe({
    tipo: 'v1_items_pedido_pagado',
    area: 'ventas',
    titulo: `${cliente} — pedido #${pedido} ya estaba ${params.estado} y se le agregó ${params.itemNombre}`,
    entidadTipo: 'orden',
    entidadId: params.ordenId,
    linkPath: '/pedidos',
    severidad: 'warning',
    metadata: {
      clienteNombre: cliente,
      ordenId: params.ordenId,
      itemNombre: params.itemNombre,
    },
  });
}

export function notifySellosHechos(params: {
  count: number;
  ordenId?: string;
  selloId?: string;
  clienteNombre?: string;
  diseno?: string;
}): void {
  const cliente = params.clienteNombre || 'Cliente';
  const titulo =
    params.count === 1
      ? `${cliente} — ${params.diseno || 'Sello'} fue terminado`
      : `Se terminaron ${params.count} sellos`;
  emitNotificacionSafe({
    tipo: 'v3_sellos_hechos',
    area: 'ventas',
    titulo,
    entidadTipo: params.count === 1 && params.selloId ? 'sello' : 'orden',
    entidadId: params.count === 1 && params.selloId ? params.selloId : params.ordenId ?? null,
    linkPath: '/pedidos',
    metadata: {
      clienteNombre: cliente,
      diseno: params.diseno,
      ordenId: params.ordenId,
    },
  });
}

export function notifyTareaAsignada(params: {
  asignadoAUserId: string;
  texto: string;
}): void {
  emitNotificacionSafe({
    tipo: 't1_tarea_asignada',
    area: null,
    titulo: `Te asignó: ${params.texto}`,
    entidadTipo: 'tarea',
    entidadId: params.asignadoAUserId,
    linkPath: '/',
    userIds: [params.asignadoAUserId],
    metadata: { itemNombre: params.texto },
  });
}

export { clienteNombreFromParts };
