import { formatDimensions, truncateToWords } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellDisenioProps {
  order: Order;
  showNotes?: boolean;
  onExpand?: () => void;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellDisenio({ order, showNotes = true, onExpand, editingRowId, onUpdate }: CellDisenioProps) {
  const item = order.items[0]; // Mostrar el primer item
  const hasMultipleItems = order.items.length > 1;
  const isEditing = editingRowId === order.id;

  if (!item) return null;

  const getItemDisplayName = () => {
    if (item.itemType === 'ABECEDARIO') return 'Abecedario';
    if (item.itemType === 'SOLDADOR') return `Soldador ${item.itemConfig?.soldadorPower || ''}`.trim();
    if (item.itemType === 'MANGO_GOLPE') return 'Mango de golpe';
    if (item.itemType === 'BASE_REMACHADORA') return 'Base remachadora';
    return item.designName || '—';
  };

  const getItemSecondary = () => {
    if (item.itemType === 'ABECEDARIO') {
      const parts = [
        item.itemConfig?.abecedarioTipografia,
        item.itemConfig?.abecedarioAlturaMm ? `${item.itemConfig.abecedarioAlturaMm}mm` : undefined,
        item.itemConfig?.abecedarioCase,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' • ') : undefined;
    }
    if (item.itemType === 'SELLO') {
      return formatDimensions(item.requestedWidthMm, item.requestedHeightMm);
    }
    return undefined;
  };

  if (isEditing && (!hasMultipleItems || order.items.length === 1)) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <EditableInline 
          value={item.designName || ''} 
          onCommit={(v) => {
            if (item.id) {
              onUpdate?.(order.id, { items: [{ id: item.id, designName: v }] });
            }
          }} 
          className="text-sm font-medium"
        />
        <EditableInline 
          value={`${item.requestedWidthMm || 0}×${item.requestedHeightMm || 0}mm`} 
          onCommit={(v) => {
            const match = v.match(/(\d+)×(\d+)/);
            if (match && item.id) {
              const width = parseInt(match[1]);
              const height = parseInt(match[2]);
              onUpdate?.(order.id, { items: [{ id: item.id, requestedWidthMm: width, requestedHeightMm: height }] });
            }
          }} 
          className="text-xs text-muted-foreground"
        />
        {showNotes && (
          <EditableInline 
            value={item.notes || ''} 
            onCommit={(v) => {
              if (item.id) {
                onUpdate?.(order.id, { items: [{ id: item.id, notes: v }] });
              }
            }} 
            className="text-xs text-blue-400"
          />
        )}
      </div>
    );
  }

  const handleClick = () => {
    if (hasMultipleItems && onExpand) {
      onExpand();
    }
  };

  // Para pedidos con múltiples items, mostrar solo el nombre con el contador
  const displayName = hasMultipleItems 
    ? `${getItemDisplayName()} +${order.items.length - 1} más`
    : getItemDisplayName();
  const secondary = getItemSecondary();

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          {secondary && <span className="shrink-0">{secondary}</span>}
          {showNotes && item.notes && (
            <span className="text-blue-400 truncate min-w-0" title={item.notes}>
              • {truncateToWords(item.notes, 5)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
