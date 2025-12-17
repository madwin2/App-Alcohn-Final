import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductionFilters } from '@/lib/state/production.store';
import { ProductionState, VectorizationState } from '@/lib/types/index';
import { getFabricationLabel } from '@/lib/utils/format';
import { Calendar, Filter, X } from 'lucide-react';

// Mapeo de ProductionState a FabricationState para mostrar etiquetas
const productionToFabricationMap: Record<ProductionState, string> = {
  'PENDIENTE': 'SIN_HACER',
  'EN_PROGRESO': 'HACIENDO',
  'COMPLETADO': 'HECHO',
  'REVISAR': 'VERIFICAR',
  'REHACER': 'REHACER'
};

// Etiquetas para estados de vectorización
const vectorizationLabels: Record<VectorizationState, string> = {
  'BASE': 'Base',
  'VECTORIZADO': 'Vectorizado',
  'DESCARGADO': 'Descargado',
  'EN_PROCESO': 'En Proceso'
};

const filtersSchema = z.object({
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  production: z.array(z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REVISAR', 'REHACER'])).optional(),
  vectorization: z.array(z.enum(['BASE', 'VECTORIZADO', 'DESCARGADO', 'EN_PROCESO'])).optional(),
});

type FiltersFormData = z.infer<typeof filtersSchema>;

interface ProductionFiltersFormProps {
  onSubmit: (data: ProductionFilters) => void;
  onClear: () => void;
  initialData: ProductionFilters;
}

export function ProductionFiltersForm({ onSubmit, onClear, initialData }: ProductionFiltersFormProps) {
  const { register, handleSubmit, watch, setValue, reset } = useForm<FiltersFormData>({
    resolver: zodResolver(filtersSchema),
    defaultValues: {
      dateRange: initialData.dateRange,
      production: initialData.production || [],
      vectorization: initialData.vectorization || [],
    },
  });

  const watchedProduction = watch('production') || [];
  const watchedVectorization = watch('vectorization') || [];

  const handleProductionChange = (state: ProductionState, checked: boolean) => {
    const current = watchedProduction;
    if (checked) {
      setValue('production', [...current, state]);
    } else {
      setValue('production', current.filter(s => s !== state));
    }
  };

  const handleVectorizationChange = (state: VectorizationState, checked: boolean) => {
    const current = watchedVectorization;
    if (checked) {
      setValue('vectorization', [...current, state]);
    } else {
      setValue('vectorization', current.filter(s => s !== state));
    }
  };


  const handleFormSubmit = (data: FiltersFormData) => {
    onSubmit(data);
  };

  const handleClear = () => {
    reset();
    onClear();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 py-2">
      {/* Rango de fechas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-semibold">Rango de fechas</Label>
        </div>
        <div className="grid grid-cols-2 gap-4 pl-6">
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs font-medium text-muted-foreground">Desde</Label>
            <Input
              id="from"
              type="date"
              {...register('dateRange.from')}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs font-medium text-muted-foreground">Hasta</Label>
            <Input
              id="to"
              type="date"
              {...register('dateRange.to')}
              className="h-9"
            />
          </div>
        </div>
      </div>

      <div className="border-t"></div>

      {/* Estados de producción */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-semibold">Estado de producción</Label>
        </div>
        <div className="grid grid-cols-2 gap-3 pl-6">
          {(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REVISAR', 'REHACER'] as ProductionState[]).map((state) => (
            <div 
              key={state} 
              className={`flex items-center space-x-3 p-2.5 rounded-lg border transition-colors ${
                watchedProduction.includes(state) 
                  ? 'bg-primary/5 border-primary/20' 
                  : 'bg-muted/30 border-border hover:bg-muted/50'
              }`}
            >
              <Checkbox
                id={`production-${state}`}
                checked={watchedProduction.includes(state)}
                onCheckedChange={(checked) => handleProductionChange(state, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label 
                htmlFor={`production-${state}`} 
                className="text-sm font-medium cursor-pointer flex-1"
              >
                {getFabricationLabel(productionToFabricationMap[state])}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Estados de vectorización */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Estado de vectorización</Label>
        <div className="grid grid-cols-2 gap-3">
          {(['BASE', 'VECTORIZADO', 'DESCARGADO', 'EN_PROCESO'] as VectorizationState[]).map((state) => (
            <div 
              key={state} 
              className={`flex items-center space-x-3 p-2.5 rounded-lg border transition-colors ${
                watchedVectorization.includes(state) 
                  ? 'bg-primary/5 border-primary/20' 
                  : 'bg-muted/30 border-border hover:bg-muted/50'
              }`}
            >
              <Checkbox
                id={`vectorization-${state}`}
                checked={watchedVectorization.includes(state)}
                onCheckedChange={(checked) => handleVectorizationChange(state, checked as boolean)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label 
                htmlFor={`vectorization-${state}`} 
                className="text-sm font-medium cursor-pointer flex-1"
              >
                {vectorizationLabels[state]}
              </Label>
            </div>
          ))}
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
          Limpiar filtros
        </Button>
        <Button type="submit" className="gap-2">
          <Filter className="h-4 w-4" />
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}














