import type { Order, OrderItem } from '@/lib/types/index';

export type OrderType = 'VENTA' | 'PRUEBA' | 'REGALO' | 'GARANTIA';

export const ORDER_TYPE_DB = {
  VENTA: 'Venta',
  PRUEBA: 'Prueba',
  REGALO: 'Regalo',
  GARANTIA: 'Garantía',
} as const satisfies Record<OrderType, string>;

export const ORDER_TYPE_FROM_DB: Record<string, OrderType> = {
  Venta: 'VENTA',
  Prueba: 'PRUEBA',
  Regalo: 'REGALO',
  Garantía: 'GARANTIA',
};

/** Cliente interno fijo para pruebas (sin WhatsApp). */
export const CLIENTE_PRUEBAS_NOMBRE = 'Alcohn';
export const CLIENTE_PRUEBAS_APELLIDO = 'Pruebas internas';

/** Un ítem cuenta como venta solo si su orden es Venta y el ítem no es regalo. */
export function itemCuentaComoVenta(
  order: Pick<Order, 'orderType'>,
  item: Pick<OrderItem, 'isGift'>,
): boolean {
  return (order.orderType ?? 'VENTA') === 'VENTA' && !item.isGift;
}

export function ordenCuentaComoVenta(order: Pick<Order, 'orderType'>): boolean {
  return (order.orderType ?? 'VENTA') === 'VENTA';
}

export function esPruebaCerrada(order: Pick<Order, 'orderType' | 'items'>): boolean {
  return (
    order.orderType === 'PRUEBA' &&
    order.items.length > 0 &&
    order.items.every((i) => i.fabricationState === 'HECHO')
  );
}

export function esOrdenSinCargo(order: Pick<Order, 'orderType'>): boolean {
  const t = order.orderType ?? 'VENTA';
  return t === 'PRUEBA' || t === 'REGALO';
}

/** Despachado / Seguimiento Enviado = ya entregado (POL-086). */
export function esEnvioPostEntrega(estadoEnvio: string | null | undefined): boolean {
  return estadoEnvio === 'Despachado' || estadoEnvio === 'Seguimiento Enviado';
}

export function orderTypeLabel(orderType: OrderType | undefined | null): string {
  switch (orderType) {
    case 'PRUEBA':
      return 'Prueba';
    case 'REGALO':
      return 'Regalo';
    case 'GARANTIA':
      return 'Garantía';
    default:
      return 'Venta';
  }
}
