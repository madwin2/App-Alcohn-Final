import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';

interface CellRestanteProps {
  order: Order;
}

export function CellRestante({ order }: CellRestanteProps) {
  const restante = order.balanceAmountCached;
  const isDebt = restante > 0;
  
  return (
    <div>
      <span className="text-sm font-medium text-gray-400">
        {formatCurrency(restante)}
      </span>
    </div>
  );
}
