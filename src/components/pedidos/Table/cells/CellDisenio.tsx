import { formatDimensions, truncateText } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';

interface CellDisenioProps {
  order: Order;
  showNotes?: boolean;
}

export function CellDisenio({ order, showNotes = true }: CellDisenioProps) {
  const item = order.items[0]; // Mostrar el primer item
  
  if (!item) return null;

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">
        {item.designName}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDimensions(item.requestedWidthMm, item.requestedHeightMm)}</span>
        {showNotes && item.notes && (
          <span className="text-blue-400 truncate" title={item.notes}>
            • {truncateText(item.notes, 15)}
          </span>
        )}
      </div>
    </div>
  );
}
