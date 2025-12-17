import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';

interface CellSeguimientoProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellSeguimiento({ order, editingRowId, onUpdate }: CellSeguimientoProps) {
  const trackingNumber = order.shipping.trackingNumber || order.items[0]?.trackingNumber;
  const isEditing = editingRowId === order.id;
  
  if (isEditing) {
    return (
      <div className="text-sm">
        <EditableInline
          value={trackingNumber || ''}
          onCommit={(v) => {
            onUpdate?.(order.id, {
              shipping: {
                ...order.shipping,
                trackingNumber: v || null
              }
            });
          }}
          className="font-mono text-xs"
        />
      </div>
    );
  }
  
  return (
    <div className="text-sm">
      {trackingNumber ? (
        <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
          {trackingNumber}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Sin asignar</span>
      )}
    </div>
  );
}
