import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellValorProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellValor({ order, editingRowId, onUpdate }: CellValorProps) {
  const item = order.items[0];
  const isEditing = editingRowId === order.id;
  const itemValue = item?.itemValue || order.totalValue || 0;
  
  if (isEditing) {
    return (
      <EditableInline 
        value={String(itemValue)} 
        onCommit={(v) => {
          const numValue = Number(v.replace(/[^0-9.]/g, '')) || 0;
          if (item) {
            onUpdate?.(order.id, { items: [{ ...item, itemValue: numValue }] });
          } else {
            onUpdate?.(order.id, { totalValue: numValue });
          }
        }} 
        className="text-sm font-medium"
      />
    );
  }
  
  return (
    <div>
      <span className="text-sm font-medium">
        {formatCurrency(itemValue)}
      </span>
    </div>
  );
}
