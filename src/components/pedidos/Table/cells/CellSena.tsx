import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';

interface CellSenaProps {
  order: Order;
}

export function CellSena({ order }: CellSenaProps) {
  const depositValue = order.depositValueOrder || 0;
  
  return (
    <div>
      <span className="text-sm font-medium text-gray-400">
        {formatCurrency(depositValue)}
      </span>
    </div>
  );
}
