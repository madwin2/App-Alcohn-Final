import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellClienteProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellCliente({ order, editingRowId, onUpdate }: CellClienteProps) {
  const { customer } = order;
  const isEditing = editingRowId === order.id;
  
  if (isEditing) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <EditableInline 
          value={customer.firstName} 
          onCommit={(v) => onUpdate?.(order.id, { customer: { ...customer, firstName: v } })} 
          className="text-sm font-medium"
        />
        <EditableInline 
          value={customer.lastName} 
          onCommit={(v) => onUpdate?.(order.id, { customer: { ...customer, lastName: v } })} 
          className="text-xs text-muted-foreground"
        />
      </div>
    );
  }
  
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">
        {customer.firstName}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {customer.lastName}
      </p>
    </div>
  );
}
