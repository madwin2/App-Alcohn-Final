import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { NotificationBell } from '@/components/notificaciones/NotificationBell';
import { useAuth } from '@/lib/hooks/useAuth';
import { isFbTestUser } from '@/lib/auth/access';

export function AuthenticatedLayout() {
  const { user } = useAuth();
  const hideExtras = isFbTestUser(user);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Outlet />
        {!hideExtras && <NotificationBell />}
      </div>
    </ProtectedRoute>
  );
}
