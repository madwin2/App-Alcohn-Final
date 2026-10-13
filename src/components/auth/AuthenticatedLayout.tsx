import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { CentroFloatButton } from '@/components/centro/CentroFloatButton';
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
        {!hideExtras && (
          <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3 md:bottom-8 md:right-8">
            <NotificationBell />
            <CentroFloatButton />
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
