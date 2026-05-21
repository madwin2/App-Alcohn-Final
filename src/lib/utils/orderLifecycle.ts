import type { Order } from '@/lib/types';

const DISPATCHED_DB = new Set(['Despachado', 'Seguimiento Enviado']);

/** Pedido cerrado: todos los sellos en Hecho y envío despachado o seguimiento enviado (nivel orden). */
export function isOrderFullyClosedFromDb(
  estadoEnvio: string | null | undefined,
  sellos: Array<{ estado_fabricacion: string | null }>,
): boolean {
  if (!sellos.length) return false;
  const allHecho = sellos.every((s) => s.estado_fabricacion === 'Hecho');
  const shipped = estadoEnvio != null && DISPATCHED_DB.has(estadoEnvio);
  return allHecho && shipped;
}

export function isOrderFullyClosed(order: Order): boolean {
  if (!order.items.length) return false;
  const allHecho = order.items.every((item) => item.fabricationState === 'HECHO');
  const shipped = order.items.every(
    (item) => item.shippingState === 'DESPACHADO' || item.shippingState === 'SEGUIMIENTO_ENVIADO',
  );
  return allHecho && shipped;
}

export function getSixMonthsCutoffDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}
