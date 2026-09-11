import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { NotificationBell } from '@/components/notificaciones/NotificationBell';

export function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Outlet />
        <NotificationBell />
      </div>
    </ProtectedRoute>
  );
}
