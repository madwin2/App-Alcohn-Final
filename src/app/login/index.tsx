import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('login');

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/pedidos');
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // El useEffect redirigirá
  }

  const handleSuccess = () => {
    // Solo redirigir si es login, no si es registro
    if (activeTab === 'login') {
      navigate('/pedidos');
    } else {
      // Para registro, solo mostrar mensaje y cambiar a login
      setActiveTab('login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Alcohn AI
          </CardTitle>
          <CardDescription className="text-center">
            Sistema de gestión de pedidos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4">
              <LoginForm onSuccess={handleSuccess} />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <SignUpForm 
                onSuccess={handleSuccess}
                onSwitchToLogin={() => setActiveTab('login')}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

