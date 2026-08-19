import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellClienteProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
  onOpenProfile?: (order: Order) => void;
}

export function CellCliente({ order, editingRowId, onUpdate, onOpenProfile }: CellClienteProps) {
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

  const content = (
    <>
      <p className="text-sm font-medium truncate">
        {customer.firstName}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {customer.lastName}
      </p>
    </>
  );

  if (!onOpenProfile || !customer.id) {
    return <div className="min-w-0">{content}</div>;
  }
  
  return (
    <button
      type="button"
      title="Ver ficha del cliente"
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile(order);
      }}
      className="min-w-0 w-full rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  );
}
