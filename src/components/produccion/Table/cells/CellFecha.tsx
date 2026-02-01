import { ProductionItem } from '@/lib/types/index';
import { formatDate } from '@/lib/utils/format';

interface CellFechaProps {
  item: ProductionItem;
  onDateChange?: (itemId: string, newDate: Date) => void;
}

export function CellFecha({ item }: CellFechaProps) {
  if (!item.date) {
    return <div className="text-xs text-muted-foreground">-</div>;
  }
  return (
    <div className="text-xs text-left">
      {formatDate(item.date)}
    </div>
  );
}
