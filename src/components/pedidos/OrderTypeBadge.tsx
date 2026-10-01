import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { orderTypeLabel, type OrderType } from '@/lib/pedidos/tipoPedido';

interface OrderTypeBadgeProps {
  orderType?: OrderType | null;
  /** Ítem regalo dentro de una venta. */
  isGift?: boolean;
  /** Mostrar también el badge "Venta" (por defecto solo Prueba/Regalo). */
  showVenta?: boolean;
  className?: string;
}

/**
 * Badge de tipo de pedido. Para ventas normales no renderiza nada (salvo `showVenta`).
 * Si el pedido es Venta pero el ítem es regalo, muestra "REGALO" (ítem sin cargo).
 */
export function OrderTypeBadge({ orderType, isGift, showVenta = false, className }: OrderTypeBadgeProps) {
  const type: OrderType = orderType ?? 'VENTA';
  const effective: OrderType = type === 'VENTA' && isGift ? 'REGALO' : type;

  if (effective === 'VENTA' && !showVenta) return null;

  return (
    <Badge
      variant="outline"
      title={
        effective === 'PRUEBA'
          ? 'Pedido de prueba interna: no es una venta ni se envía'
          : effective === 'REGALO'
            ? type === 'VENTA'
              ? 'Ítem regalo (sin cargo) dentro de una venta'
              : 'Pedido de regalo: sin cargo, el envío lo paga Alcohn'
            : undefined
      }
      className={cn(
        'px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide leading-4 shrink-0',
        effective === 'PRUEBA' && 'border-violet-500/50 bg-violet-500/10 text-violet-300',
        effective === 'REGALO' && 'border-pink-500/50 bg-pink-500/10 text-pink-300',
        effective === 'VENTA' && 'border-white/20 text-muted-foreground',
        className,
      )}
    >
      {effective === 'VENTA' ? orderTypeLabel('VENTA') : orderTypeLabel(effective).toUpperCase()}
    </Badge>
  );
}
