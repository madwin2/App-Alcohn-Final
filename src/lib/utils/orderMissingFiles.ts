import type { Order, OrderItem } from '@/lib/types/index';

/** Un ítem cuenta como sello si no tiene tipo o es explícitamente SELLO. */
export function isSelloItem(item: Pick<OrderItem, 'itemType'>): boolean {
  return !item.itemType || item.itemType === 'SELLO';
}

function hasMeaningfulUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url === 'summary') return false;
  return url.trim().length > 0;
}

/** Sello sin archivo base ni vector (preview o EPS). No aplica si ya está Hecho. */
export function isSelloMissingBaseAndVector(
  item: Pick<OrderItem, 'itemType' | 'files' | 'fabricationState'>,
): boolean {
  if (!isSelloItem(item)) return false;
  if (item.fabricationState === 'HECHO') return false;
  const hasBase = hasMeaningfulUrl(item.files?.baseUrl);
  const hasVector =
    hasMeaningfulUrl(item.files?.vectorPreviewUrl) ||
    hasMeaningfulUrl(item.files?.vectorUrl);
  return !hasBase && !hasVector;
}

/** Pedido con al menos un sello sin base ni vector. */
export function orderHasSelloMissingFiles(order: Order): boolean {
  return order.items.some(isSelloMissingBaseAndVector);
}

export function countOrdersWithSelloMissingFiles(
  orders: Order[],
  limit = 50,
): number {
  return orders.slice(0, limit).filter(orderHasSelloMissingFiles).length;
}
