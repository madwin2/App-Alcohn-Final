import { Order } from '@/lib/types/index';

interface CellClienteProps {
  order: Order;
}

export function CellCliente({ order }: CellClienteProps) {
  const { customer } = order;
  
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">
        {customer.firstName}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {customer.lastName}
      </p>
    </div>
  );
}
