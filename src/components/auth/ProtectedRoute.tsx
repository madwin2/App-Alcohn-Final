import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/hooks/useAuth';
import { getPostLoginPath, isPathAllowedForUser } from '@/lib/auth/access';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (!isPathAllowedForUser(user, location.pathname)) {
      navigate(getPostLoginPath(user), { replace: true });
    }
  }, [isAuthenticated, loading, location.pathname, navigate, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // El useEffect redirigirá
  }

  return <>{children}</>;
}












