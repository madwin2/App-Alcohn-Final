import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionSortState } from '@/lib/state/production.store';
import { FabricationState, ProductionFabricacionAspireKey } from '@/lib/types/index';
import { getFabricationLabel } from '@/lib/utils/format';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ArrowUpDown, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';

const aspirePriorityKeys = [
  'ASPIRE_Aspire_G',
  'ASPIRE_Aspire_G_Check',
  'ASPIRE_Aspire_C',
  'ASPIRE_Aspire_C_Check',
  'ASPIRE_Aspire_XL',
] as const;

const getProductionPriorityLabel = (state: ProductionFabricacionAspireKey) => {
  if (typeof state === 'string' && state.startsWith('ASPIRE_')) {
    return state.replace('ASPIRE_', '').replace(/_/g, ' ');
  }
  return getFabricationLabel(state as FabricationState);
};

const sortSchema = z.object({
  productionPriority: z.array(z.enum([
    'SIN_HACER',
    ...aspirePriorityKeys,
    'HACIENDO',
    'VERIFICAR',
    'HECHO',
    'REHACER',
    'RETOCAR',
    'PROGRAMADO'
  ])),
  criteria: z.array(z.object({
    field: z.enum(['fecha', 'tarea', 'tipo', 'disenio', 'medida', 'fabricacion', 'vectorizado', 'programa', 'aspire', 'maquina']),
    dir: z.enum(['asc', 'desc'])
  }))
});

type SortFormData = z.infer<typeof sortSchema>;

interface ProductionSortFormProps {
  onSubmit: (data: ProductionSortState) => void;
  initialData: ProductionSortState;
}

// Componente para elementos arrastrables
function SortableProductionState({ state, index }: { state: ProductionFabricacionAspireKey; index: number }) {
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
      className={`flex items-center justify-between p-3.5 bg-card rounded-lg border transition-all ${
        isDragging ? 'opacity-50 shadow-lg border-primary/50' : 'border-border hover:border-primary/30 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded transition-colors"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium">{getProductionPriorityLabel(state)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
          #{index + 1}
        </span>
      </div>
    </div>
  );
}

export function ProductionSortForm({ onSubmit, initialData }: ProductionSortFormProps) {
  const { handleSubmit, watch, setValue, reset } = useForm<SortFormData>({
    resolver: zodResolver(sortSchema),
    defaultValues: {
      productionPriority: initialData.productionPriority,
      criteria: initialData.criteria,
    },
  });

  // Sincronizar cuando cambien los datos iniciales
  useEffect(() => {
    reset({
      productionPriority: initialData.productionPriority,
      criteria: initialData.criteria,
    });
  }, [initialData, reset]);

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
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 py-2">
      {/* Prioridad de estados */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-semibold">Prioridad de estados de producción</Label>
        </div>
        <p className="text-xs text-muted-foreground pl-6">
          Arrastra los elementos para reordenar según su prioridad
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={watchedPriority}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 pl-6">
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

      <div className="border-t pt-4"></div>

      {/* Criterios de ordenamiento */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base font-semibold">Criterios de ordenamiento</Label>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addCriteria}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Agregar criterio
          </Button>
        </div>
        
        <div className="space-y-2">
          {watchedCriteria.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
              No hay criterios configurados. Agrega uno para comenzar.
            </div>
          ) : (
            watchedCriteria.map((criterion, index) => (
              <div 
                key={index} 
                className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  <Select
                    value={criterion.field}
                    onValueChange={(value) => updateCriteria(index, value, criterion.dir)}
                  >
                    <SelectTrigger className="w-[180px]">
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
                      <SelectItem value="aspire">Estado Aspire</SelectItem>
                      <SelectItem value="maquina">Máquina</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={criterion.dir}
                    onValueChange={(value: 'asc' | 'desc') => updateCriteria(index, criterion.field, value)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="h-3 w-3" />
                          Ascendente
                        </div>
                      </SelectItem>
                      <SelectItem value="desc">
                        <div className="flex items-center gap-2">
                          <ArrowDown className="h-3 w-3" />
                          Descendente
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeCriteria(index)}
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button 
          type="button" 
          variant="outline" 
          onClick={handleClear}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Limpiar
        </Button>
        <Button type="submit" className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Aplicar ordenamiento
        </Button>
      </div>
    </form>
  );
}














