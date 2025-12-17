import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const signUpSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  apellido: z.string().min(2, 'El apellido debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type SignUpFormData = z.infer<typeof signUpSchema>;

interface SignUpFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function SignUpForm({ onSuccess, onSwitchToLogin }: SignUpFormProps) {
  const { toast } = useToast();
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormData) => {
    try {
      setIsLoading(true);
      await signUp(data.email, data.password, {
        nombre: data.nombre,
        apellido: data.apellido,
      });
      toast({
        title: '¡Solicitud enviada!',
        description: 'Tu solicitud de registro ha sido enviada. Un administrador la revisará y te notificará cuando sea aprobada.',
      });
      // No redirigir automáticamente, mostrar mensaje
      onSuccess?.();
    } catch (error: any) {
      console.error('Error al crear cuenta:', error);
      toast({
        title: 'Error al crear cuenta',
        description: error.message || 'No se pudo crear la cuenta',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            placeholder="Juan"
            {...register('nombre')}
            className={errors.nombre ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {errors.nombre && (
            <p className="text-xs text-red-500">{errors.nombre.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="apellido">Apellido</Label>
          <Input
            id="apellido"
            placeholder="Pérez"
            {...register('apellido')}
            className={errors.apellido ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {errors.apellido && (
            <p className="text-xs text-red-500">{errors.apellido.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          {...register('email')}
          className={errors.email ? 'border-red-500' : ''}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          className={errors.password ? 'border-red-500' : ''}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-xs text-red-500">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
          className={errors.confirmPassword ? 'border-red-500' : ''}
          disabled={isLoading}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creando cuenta...
          </>
        ) : (
          'Crear Cuenta'
        )}
      </Button>

      {onSwitchToLogin && (
        <div className="text-center text-sm">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary hover:underline"
            disabled={isLoading}
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        </div>
      )}
    </form>
  );
}

