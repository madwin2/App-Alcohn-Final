import type { Order } from '@/lib/types';
import { aPesos } from '@/lib/internacional';

/** Si la orden no tiene empresa/servicio de envío cargado, imputamos este costo (todo se envía). */
export const ECONOMIA_ENVIO_SIN_TIPO_ARS = 5000;

export function orderHasShippingCarrierAndService(order: Order): boolean {
  const c = order.shipping?.carrier;
  const s = order.shipping?.service;
  return Boolean(c && c !== 'OTRO' && c !== 'RETIRO_EN_PERSONA' && s);
}

/** Envío imputado a ventas solo si ya salió el envío (no antes, para no inflar plata). */
export function economiaPedidoListoParaImputarEnvio(order: Order): boolean {
  if (!order.items.length) return false;
  return order.items.every(
    (it) => it.shippingState === 'DESPACHADO' || it.shippingState === 'SEGUIMIENTO_ENVIADO',
  );
}

/**
 * Andreani con link (actual o histórico): el cliente paga en la web de Andreani;
 * esa plata no entra a Alcohn → no se imputa a ventas / transferido / regalos.
 */
export function ordenAndreaniConLinkAsignado(order: Order): boolean {
  if (order.shipping?.carrier !== 'ANDREANI') return false;
  return Boolean(order.andreaniLinkUrl || order.andreaniTuvoLink);
}

/**
 * Monto de envío a sumar en Economía (ventas brutas, transferido, costo regalos).
 * `shippingCostByOrderId` viene de `costos_de_envio` para órdenes con carrier/servicio.
 */
export function economiaEnvioImputadoArs(
  order: Order,
  shippingCostByOrderId: Record<string, number>,
  defaultSinTipoArs: number = ECONOMIA_ENVIO_SIN_TIPO_ARS,
): number {
  if (!economiaPedidoListoParaImputarEnvio(order)) return 0;
  if (order.international) {
    return aPesos(Number(order.internationalShipping || 0), order.international);
  }
  if (ordenAndreaniConLinkAsignado(order)) return 0;
  if (orderHasShippingCarrierAndService(order)) {
    return shippingCostByOrderId[order.id] ?? defaultSinTipoArs;
  }
  return defaultSinTipoArs;
}
