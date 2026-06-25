import type { ItemType, OrderItem } from '@/lib/types';

type ItemDisplayInput = Pick<OrderItem, 'designName' | 'itemType' | 'itemConfig'>;

export function getOrderItemDisplayName(item: ItemDisplayInput): string {
  if (item.itemType === 'ABECEDARIO') return 'Abecedario';
  if (item.itemType === 'SOLDADOR') {
    return `Soldador ${item.itemConfig?.soldadorPower || ''}`.trim();
  }
  if (item.itemType === 'MANGO_GOLPE') return 'Mango de golpe';
  if (item.itemType === 'BASE_REMACHADORA') return 'Base remachadora';

  const name = item.designName?.trim();
  if (name && name.toLowerCase() !== 'sin diseño') return name;
  return name || 'Sin diseño';
}

export function getItemTypeLabel(itemType: ItemType): string {
  const labels: Record<ItemType, string> = {
    SELLO: 'Sello',
    ABECEDARIO: 'Abecedario',
    SOLDADOR: 'Soldador',
    MANGO_GOLPE: 'Mango de golpe',
    BASE_REMACHADORA: 'Base remachadora',
  };
  return labels[itemType];
}
