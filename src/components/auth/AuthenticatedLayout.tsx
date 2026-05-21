import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrdersProvider } from '@/lib/context/OrdersProvider';

/** Una sola instancia de pedidos cacheados para todas las rutas autenticadas. */
export function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <OrdersProvider>
        <Outlet />
      </OrdersProvider>
    </ProtectedRoute>
  );
}
