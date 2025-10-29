import { formatDimensions, truncateText } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';

interface CellDisenioProps {
  order: Order;
  showNotes?: boolean;
  onExpand?: () => void;
}

export function CellDisenio({ order, showNotes = true, onExpand }: CellDisenioProps) {
  const item = order.items[0]; // Mostrar el primer item
  const hasMultipleItems = order.items.length > 1;
  
  // Debug: mostrar información en consola
  console.log('CellDisenio - Order ID:', order.id, 'Items count:', order.items.length, 'HasMultiple:', hasMultipleItems);
  console.log('CellDisenio - Order object:', order);
  console.log('CellDisenio - Items array:', order.items);
  
  if (!item) return null;

  const handleClick = () => {
    console.log('CellDisenio clicked - hasMultipleItems:', hasMultipleItems, 'onExpand:', !!onExpand);
    if (hasMultipleItems && onExpand) {
      onExpand();
    }
  };

  // Para pedidos con múltiples items, mostrar solo el nombre con el contador
  const displayName = hasMultipleItems 
    ? `${item.designName} +${order.items.length - 1} más`
    : item.designName;

  return (
    <div className="min-w-0">
      <p 
        className={`text-sm font-medium truncate ${hasMultipleItems ? 'cursor-pointer hover:text-blue-500 transition-colors underline' : ''}`}
        onClick={handleClick}
        title={hasMultipleItems ? 'Click para expandir' : undefined}
      >
        {displayName}
      </p>
      {/* Solo mostrar medidas y notas si NO hay múltiples items */}
      {!hasMultipleItems && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDimensions(item.requestedWidthMm, item.requestedHeightMm)}</span>
          {showNotes && item.notes && (
            <span className="text-blue-400 truncate" title={item.notes}>
              • {item.notes}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
