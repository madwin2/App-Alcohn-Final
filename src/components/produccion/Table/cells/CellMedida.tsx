import { ProductionItem } from '@/lib/types/index';
import { formatDimensions } from '@/lib/utils/format';

interface CellMedidaProps {
  item: ProductionItem;
}

const PLACEHOLDER_MM = 1;

export function CellMedida({ item }: CellMedidaProps) {
  if (item.itemType === 'ABECEDARIO') {
    const altura = item.itemConfig?.abecedarioAlturaMm;
    return (
      <div className="text-sm text-left text-gray-400">
        {altura ? `${altura}mm` : '—'}
      </div>
    );
  }

  if (
    item.itemType === 'SOLDADOR' ||
    item.itemType === 'MANGO_GOLPE' ||
    item.itemType === 'BASE_REMACHADORA'
  ) {
    return <div className="text-sm text-left text-gray-400">—</div>;
  }

  const w = item.requestedWidthMm ?? 0;
  const h = item.requestedHeightMm ?? 0;
  if (w === PLACEHOLDER_MM && h === PLACEHOLDER_MM) {
    return <div className="text-sm text-left text-gray-400">—</div>;
  }

  return (
    <div className="text-sm text-left text-gray-400">
      {formatDimensions(w, h)}
    </div>
  );
}
