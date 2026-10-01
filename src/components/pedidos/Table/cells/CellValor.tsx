import { formatMontoPedido } from '@/lib/internacional';
import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';
import { esOrdenSinCargo } from '@/lib/pedidos/tipoPedido';

interface CellValorProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellValor({ order, editingRowId, onUpdate }: CellValorProps) {
  const item = order.items[0];
  const isEditing = editingRowId === order.id;
  const hasMultipleItems = order.items.length > 1;

  // Regalo/Prueba (o ítem regalo individual): sin cargo, no editable.
  if (esOrdenSinCargo(order) || (!hasMultipleItems && item?.isGift)) {
    return (
      <div>
        <span className="text-sm font-medium text-muted-foreground">Sin cargo</span>
      </div>
    );
  }
  
  // Si es la fila resumen (múltiples items), usar el valor calculado por Supabase
  if (hasMultipleItems) {
    return (
      <div>
        <span className="text-sm font-medium">
          {formatMontoPedido(order, order.totalValue || 0)}
        </span>
      </div>
    );
  }
  
  // Si es un item individual, mostrar el valor del item
  const itemValue = item?.itemValue || order.totalValue || 0;
  
  if (isEditing) {
    return (
      <EditableInline 
        value={String(itemValue)} 
        onCommit={(v) => {
          const numValue = Number(v.replace(/[^0-9.]/g, '')) || 0;
          if (item && item.id) {
            // Actualizar solo el item específico usando su ID
            onUpdate?.(order.id, { items: [{ id: item.id, itemValue: numValue }] });
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
        {formatMontoPedido(order, itemValue)}
      </span>
    </div>
  );
}
