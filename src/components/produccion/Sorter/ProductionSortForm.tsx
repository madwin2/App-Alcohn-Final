import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionSortState, ProductionSortCriteria } from '@/lib/state/production.store';
import { FabricationState } from '@/lib/types/index';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const sortSchema = z.object({
  productionPriority: z.array(z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR'])),
  criteria: z.array(z.object({
    field: z.enum(['fecha', 'tarea', 'tipo', 'disenio', 'medida', 'fabricacion', 'vectorizado', 'programa']),
    dir: z.enum(['asc', 'desc'])
  }))
});

type SortFormData = z.infer<typeof sortSchema>;

interface ProductionSortFormProps {
  onSubmit: (data: ProductionSortState) => void;
  initialData: ProductionSortState;
}

// Componente para elementos arrastrables
function SortableProductionState({ state, index }: { state: FabricationState; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: state });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-muted rounded-lg border ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted-foreground/20 rounded"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium">{state.replace('_', ' ')}</span>
      </div>
      <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded">
        #{index + 1}
      </span>
    </div>
  );
}

export function ProductionSortForm({ onSubmit, initialData }: ProductionSortFormProps) {
  const { register, handleSubmit, watch, setValue, reset } = useForm<SortFormData>({
    resolver: zodResolver(sortSchema),
    defaultValues: {
      productionPriority: initialData.productionPriority,
      criteria: initialData.criteria,
    },
  });

  const watchedCriteria = watch('criteria') || [];
  const watchedPriority = watch('productionPriority') || [];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = watchedPriority.indexOf(active.id);
      const newIndex = watchedPriority.indexOf(over.id);
      
      const newPriority = arrayMove(watchedPriority, oldIndex, newIndex);
      setValue('productionPriority', newPriority);
    }
  };

  const addCriteria = () => {
    const current = watchedCriteria;
    setValue('criteria', [...current, { field: 'fecha', dir: 'asc' }]);
  };

  const removeCriteria = (index: number) => {
    const current = watchedCriteria;
    setValue('criteria', current.filter((_, i) => i !== index));
  };

  const updateCriteria = (index: number, field: string, dir: 'asc' | 'desc') => {
    const current = watchedCriteria;
    const updated = current.map((c, i) => i === index ? { field: field as any, dir } : c);
    setValue('criteria', updated);
  };

  const handleFormSubmit = (data: SortFormData) => {
    onSubmit(data);
  };

  const handleClear = () => {
    reset();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Prioridad de estados */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Prioridad de estados de producción</Label>
        <div className="text-xs text-muted-foreground">
          Arrastra para reordenar los estados según su prioridad
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={watchedPriority}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {watchedPriority.map((state, index) => (
                <SortableProductionState
                  key={state}
                  state={state}
                  index={index}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Criterios de ordenamiento */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Criterios de ordenamiento</Label>
          <Button type="button" variant="outline" size="sm" onClick={addCriteria}>
            Agregar criterio
          </Button>
        </div>
        
        <div className="space-y-2">
          {watchedCriteria.map((criterion, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={criterion.field}
                onValueChange={(value) => updateCriteria(index, value, criterion.dir)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fecha">Fecha</SelectItem>
                  <SelectItem value="tarea">Tarea</SelectItem>
                  <SelectItem value="tipo">Tipo</SelectItem>
                  <SelectItem value="disenio">Diseño</SelectItem>
                  <SelectItem value="medida">Medida</SelectItem>
                  <SelectItem value="fabricacion">Fabricación</SelectItem>
                  <SelectItem value="vectorizado">Vectorizado</SelectItem>
                  <SelectItem value="programa">Programa</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={criterion.dir}
                onValueChange={(value: 'asc' | 'desc') => updateCriteria(index, criterion.field, value)}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Asc</SelectItem>
                  <SelectItem value="desc">Desc</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeCriteria(index)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleClear}>
          Limpiar
        </Button>
        <Button type="submit">
          Aplicar ordenamiento
        </Button>
      </div>
    </form>
  );
}











