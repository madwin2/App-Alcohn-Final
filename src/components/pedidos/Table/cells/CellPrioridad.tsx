import { useState } from 'react';
import { Order } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface CellPrioridadProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

// Muestra un indicador compacto si el primer item del pedido es prioritario
export function CellPrioridad({ order, editingRowId, onUpdate }: CellPrioridadProps) {
  const item = order.items[0];
  const isPriority = !!item?.isPriority;
  const isEditing = editingRowId === order.id;
  const hasMultipleItems = order.items.length > 1;
  const [isUpdating, setIsUpdating] = useState(false);

  // Permitir edición si estamos editando y (no hay múltiples items O hay un solo item en esta fila)
  if (isEditing) {
    // Modo edición: mostrar checkbox
    return (
      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`priority-${order.id}-${item?.id || ''}`}
            checked={isPriority}
            disabled={isUpdating}
            onCheckedChange={async (checked) => {
              if (!item || !item.id || !onUpdate) return;
              try {
                setIsUpdating(true);
                // Actualizar solo el item específico usando su ID
                await onUpdate(order.id, { items: [{ id: item.id, isPriority: !!checked }] });
              } finally {
                setIsUpdating(false);
              }
            }}
          />
          <Label htmlFor={`priority-${order.id}-${item?.id || ''}`} className="text-xs cursor-pointer">
            Prioridad
          </Label>
          {isUpdating && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
    );
  }

  if (!isPriority) {
    return <span className="text-muted-foreground/60 text-xs">—</span>;
  }

  return (
    <span
      aria-label="Pedido prioritario"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-red-600 text-white border border-red-500"
    >
      Prioridad
    </span>
  );
}


