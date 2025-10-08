import { Order } from '@/lib/types/index';

interface CellSeguimientoProps {
  order: Order;
}

export function CellSeguimiento({ order }: CellSeguimientoProps) {
  const trackingNumber = order.shipping.trackingNumber || order.items[0]?.trackingNumber;
  
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
