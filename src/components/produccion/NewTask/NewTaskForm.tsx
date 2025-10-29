import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionState } from '@/lib/types/index';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REVISAR', 'REHACER']),
  assignedTo: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface NewTaskFormProps {
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
}

export function NewTaskForm({ onSubmit, onCancel }: NewTaskFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      status: 'PENDIENTE',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Título */}
      <div className="space-y-2">
        <Label htmlFor="title">Título de la tarea</Label>
        <Input
          id="title"
          {...register('title')}
          placeholder="Ej: Revisar diseño base"
        />
        {errors.title && (
          <p className="text-sm text-red-500">{errors.title.message}</p>
        )}
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Detalles adicionales sobre la tarea..."
          rows={3}
        />
      </div>

      {/* Fecha límite */}
      <div className="space-y-2">
        <Label htmlFor="dueDate">Fecha límite (opcional)</Label>
        <Input
          id="dueDate"
          type="date"
          {...register('dueDate')}
        />
      </div>

      {/* Estado */}
      <div className="space-y-2">
        <Label htmlFor="status">Estado inicial</Label>
        <Select {...register('status')}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDIENTE">Pendiente</SelectItem>
            <SelectItem value="EN_PROGRESO">En Progreso</SelectItem>
            <SelectItem value="COMPLETADO">Completado</SelectItem>
            <SelectItem value="REVISAR">Revisar</SelectItem>
            <SelectItem value="REHACER">Rehacer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Asignado a */}
      <div className="space-y-2">
        <Label htmlFor="assignedTo">Asignado a (opcional)</Label>
        <Input
          id="assignedTo"
          {...register('assignedTo')}
          placeholder="Nombre del responsable"
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">
          Crear tarea
        </Button>
      </div>
    </form>
  );
}











