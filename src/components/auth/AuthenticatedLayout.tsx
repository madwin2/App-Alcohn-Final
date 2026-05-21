import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';

export function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Outlet />
      </div>
    </ProtectedRoute>
  );
}
