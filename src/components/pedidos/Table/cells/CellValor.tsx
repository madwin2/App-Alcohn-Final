import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';

interface CellValorProps {
  order: Order;
}

export function CellValor({ order }: CellValorProps) {
  return (
    <div>
      <span className="text-sm font-medium">
        {formatCurrency(order.totalValue)}
      </span>
    </div>
  );
}
