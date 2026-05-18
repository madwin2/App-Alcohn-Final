import type { NewOrderFormData } from '@/lib/types/index';

export interface SavedDesignData {
  order: NewOrderFormData['order'];
  values: NewOrderFormData['values'];
  shipping: NewOrderFormData['shipping'];
  states: NewOrderFormData['states'];
  files?: NewOrderFormData['files'];
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  SELLO: 'Sello',
  ABECEDARIO: 'Abecedario',
  SOLDADOR: 'Soldador',
  MANGO_GOLPE: 'Mango de Golpe',
  BASE_REMACHADORA: 'Base Remachadora',
};

export function getDesignTabLabel(design: SavedDesignData, index: number): string {
  const name =
    design.order.itemType === 'SELLO' ? design.order.designName?.trim() : '';
  const itemType = design.order.itemType ?? 'SELLO';
  const base = name || ITEM_TYPE_LABELS[itemType] || `Diseño ${index + 1}`;
  const hasFiles = !!(design.files?.base || design.files?.vector);
  return hasFiles ? `${base} · archivos` : base;
}

export function measureInputFromDesign(order: SavedDesignData['order']): string {
  const w = order.requestedWidthMm;
  const h = order.requestedHeightMm;
  if (!w || !h || (w === 1 && h === 1)) return '';
  if (w === h) return String(w);
  return `${w}×${h}`;
}
