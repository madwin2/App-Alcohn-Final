import { Outlet } from 'react-router-dom';
import { OrdersProvider } from '@/lib/context/OrdersProvider';

/** Layout: un solo provider compartido entre Inicio, Pedidos, Envíos y Economía. */
export function OrdersScopeLayout() {
  return (
    <OrdersProvider>
      <Outlet />
    </OrdersProvider>
  );
}
