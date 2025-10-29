import { Order } from '@/lib/types';

interface CellPrioridadProps {
  order: Order;
}

// Muestra un indicador compacto si el primer item del pedido es prioritario
export function CellPrioridad({ order }: CellPrioridadProps) {
  const item = order.items[0];
  const isPriority = !!item?.isPriority;

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


