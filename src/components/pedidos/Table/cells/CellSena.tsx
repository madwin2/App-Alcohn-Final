import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellSenaProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellSena({ order, editingRowId, onUpdate }: CellSenaProps) {
  const item = order.items[0];
  const isEditing = editingRowId === order.id;
  const depositValue = item?.depositValueItem || order.depositValueOrder || 0;
  
  if (isEditing) {
    return (
      <EditableInline 
        value={String(depositValue)} 
        onCommit={(v) => {
          const numValue = Number(v.replace(/[^0-9.]/g, '')) || 0;
          if (item) {
            onUpdate?.(order.id, { items: [{ ...item, depositValueItem: numValue }] });
          } else {
            onUpdate?.(order.id, { depositValueOrder: numValue });
          }
        }} 
        className="text-sm font-medium text-gray-400"
      />
    );
  }
  
  return (
    <div>
      <span className="text-sm font-medium text-gray-400">
        {formatCurrency(depositValue)}
      </span>
    </div>
  );
}
