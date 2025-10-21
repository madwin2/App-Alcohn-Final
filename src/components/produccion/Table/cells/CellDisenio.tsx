import { ProductionItem } from '@/lib/types/index';

interface CellDisenioProps {
  item: ProductionItem;
}

export function CellDisenio({ item }: CellDisenioProps) {
  return (
    <div className="text-sm font-medium">
      {item.designName}
    </div>
  );
}
