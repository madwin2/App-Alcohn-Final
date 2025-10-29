import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductionFilters, ProductionState, VectorizationState, ProgramType } from '@/lib/state/production.store';

const filtersSchema = z.object({
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  production: z.array(z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REVISAR', 'REHACER'])).optional(),
  vectorization: z.array(z.enum(['PENDIENTE', 'COMPLETADO', 'NO_REQUERIDO'])).optional(),
  program: z.array(z.enum(['ILLUSTRATOR', 'PHOTOSHOP', 'COREL', 'AUTOCAD', 'OTRO'])).optional(),
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
      program: initialData.program || [],
    },
  });

  const watchedProduction = watch('production') || [];
  const watchedVectorization = watch('vectorization') || [];
  const watchedProgram = watch('program') || [];

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

  const handleProgramChange = (program: ProgramType, checked: boolean) => {
    const current = watchedProgram;
    if (checked) {
      setValue('program', [...current, program]);
    } else {
      setValue('program', current.filter(p => p !== program));
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
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Rango de fechas */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Rango de fechas</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="from" className="text-xs text-muted-foreground">Desde</Label>
            <Input
              id="from"
              type="date"
              {...register('dateRange.from')}
            />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              id="to"
              type="date"
              {...register('dateRange.to')}
            />
          </div>
        </div>
      </div>

      {/* Estados de producción */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Estado de producción</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REVISAR', 'REHACER'] as ProductionState[]).map((state) => (
            <div key={state} className="flex items-center space-x-2">
              <Checkbox
                id={`production-${state}`}
                checked={watchedProduction.includes(state)}
                onCheckedChange={(checked) => handleProductionChange(state, checked as boolean)}
              />
              <Label htmlFor={`production-${state}`} className="text-sm">
                {state.replace('_', ' ')}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Estados de vectorización */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Estado de vectorización</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['PENDIENTE', 'COMPLETADO', 'NO_REQUERIDO'] as VectorizationState[]).map((state) => (
            <div key={state} className="flex items-center space-x-2">
              <Checkbox
                id={`vectorization-${state}`}
                checked={watchedVectorization.includes(state)}
                onCheckedChange={(checked) => handleVectorizationChange(state, checked as boolean)}
              />
              <Label htmlFor={`vectorization-${state}`} className="text-sm">
                {state.replace('_', ' ')}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Programas */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Programa</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['ILLUSTRATOR', 'PHOTOSHOP', 'COREL', 'AUTOCAD', 'OTRO'] as ProgramType[]).map((program) => (
            <div key={program} className="flex items-center space-x-2">
              <Checkbox
                id={`program-${program}`}
                checked={watchedProgram.includes(program)}
                onCheckedChange={(checked) => handleProgramChange(program, checked as boolean)}
              />
              <Label htmlFor={`program-${program}`} className="text-sm">
                {program}
              </Label>
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
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}











