import { formatMontoPedido } from '@/lib/internacional';
import { Order } from '@/lib/types/index';
import { EditableInline } from './EditableInline';
import { esOrdenSinCargo } from '@/lib/pedidos/tipoPedido';

interface CellSenaProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellSena({ order, editingRowId, onUpdate }: CellSenaProps) {
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
        <span className="text-sm font-medium text-gray-400">
          {formatMontoPedido(order, order.depositValueOrder || 0)}
        </span>
      </div>
    );
  }
  
  // Si es un item individual, mostrar la seña del item
  const depositValue = item?.depositValueItem || order.depositValueOrder || 0;
  
  if (isEditing) {
    return (
      <EditableInline 
        value={String(depositValue)} 
        onCommit={(v) => {
          const numValue = Number(v.replace(/[^0-9.]/g, '')) || 0;
          if (item && item.id) {
            // Actualizar solo el item específico usando su ID
            onUpdate?.(order.id, { items: [{ id: item.id, depositValueItem: numValue }] });
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
        {formatMontoPedido(order, depositValue)}
      </span>
    </div>
  );
}
