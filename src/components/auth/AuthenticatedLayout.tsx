import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrdersProvider } from '@/lib/context/OrdersProvider';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';

/**
 * Sidebar fuera de OrdersProvider para que no se re-renderice
 * en cada actualización de la lista de pedidos.
 */
export function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <OrdersProvider>
          <Outlet />
        </OrdersProvider>
      </div>
    </ProtectedRoute>
  );
}
