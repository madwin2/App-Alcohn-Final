import { ProductionItem } from '@/lib/types/index';

interface CellMedidaProps {
  item: ProductionItem;
}

export function CellMedida({ item }: CellMedidaProps) {
  return (
    <div className="text-sm text-left text-gray-400">
      {item.requestedWidthMm}×{item.requestedHeightMm}mm
    </div>
  );
}
