import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

const programSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().min(1, 'La descripción es requerida'),
  version: z.string().min(1, 'La versión es requerida'),
  status: z.enum(['active', 'inactive']),
});

type ProgramFormData = z.infer<typeof programSchema>;

interface NewProgramFormProps {
  onSuccess: () => void;
}

// Formulario para crear un nuevo programa con validación
export function NewProgramForm({ onSuccess }: NewProgramFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      status: 'active'
    }
  });

  const onSubmit = async (data: ProgramFormData) => {
    try {
      // Aquí iría la lógica para crear el programa
      console.log('Creando programa:', data);
      
      toast({
        title: "Programa creado",
        description: "El programa se ha creado exitosamente.",
      });
      
      onSuccess();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el programa. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre del Programa</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="Ingresa el nombre del programa"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Describe el programa y su propósito"
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="version">Versión</Label>
            <Input
              id="version"
              {...register('version')}
              placeholder="v1.0.0"
            />
            {errors.version && (
              <p className="text-sm text-destructive">{errors.version.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select
              value={watch('status')}
              onValueChange={(value) => setValue('status', value as 'active' | 'inactive')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-sm text-destructive">{errors.status.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline">
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando...' : 'Crear Programa'}
        </Button>
      </div>
    </form>
  );
}
