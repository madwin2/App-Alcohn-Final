import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductionFilters } from '@/lib/state/production.store';
import { ProductionState, VectorizationState } from '@/lib/types/index';
import { getFabricationLabel } from '@/lib/utils/format';
import { Calendar, Filter, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';

const MONTH_LABELS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function getMonthOptions(count: number = 24): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_LABELS[m]} ${y}`;
    options.push({ value, label });
  }
  return options;
}

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
    from: z.string().optional(),
    to: z.string().optional(),
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

  const dateToLocalString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fromValue = watch('dateRange.from');
  const toValue = watch('dateRange.to');
  const monthOptions = getMonthOptions(24);

  const setFromDate = (d?: Date) => setValue('dateRange.from', d ? dateToLocalString(d) : undefined);
  const setToDate = (d?: Date) => setValue('dateRange.to', d ? dateToLocalString(d) : undefined);

  const parseDateSafe = (s: string | undefined): Date | undefined => {
    if (!s || typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const setQuickRange = (preset: 'hoy' | 'ayer' | 'esta_semana') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === 'hoy') {
      setValue('dateRange', { from: dateToLocalString(today), to: dateToLocalString(today) });
      return;
    }
    if (preset === 'ayer') {
      const ayer = new Date(today);
      ayer.setDate(ayer.getDate() - 1);
      setValue('dateRange', { from: dateToLocalString(ayer), to: dateToLocalString(ayer) });
      return;
    }
    if (preset === 'esta_semana') {
      const day = today.getDay();
      const lunes = new Date(today);
      lunes.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      setValue('dateRange', { from: dateToLocalString(lunes), to: dateToLocalString(domingo) });
    }
  };

  const setMonthRange = (valueKey: string) => {
    const [y, m] = valueKey.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    setFromDate(from);
    setToDate(to);
  };

  const selectedMonthValue = (() => {
    const from = parseDateSafe(fromValue);
    const to = parseDateSafe(toValue);
    if (!from || !to || from.getDate() !== 1) return '';
    const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    if (dateToLocalString(to) !== dateToLocalString(lastDay)) return '';
    return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
  })();

  const handleFormSubmit = (data: FiltersFormData) => {
    onSubmit(data);
  };

  const handleClear = () => {
    reset({
      dateRange: undefined,
      production: [],
      vectorization: [],
    });
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
        <div className="space-y-3 pl-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange('hoy')}>
              Hoy
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange('ayer')}>
              Ayer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickRange('esta_semana')}>
              Esta semana
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Mes</Label>
            <Select value={selectedMonthValue || undefined} onValueChange={setMonthRange}>
              <SelectTrigger className="w-full max-w-[200px]">
                <SelectValue placeholder="Seleccionar mes (ej. febrero 2026)" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
              <DatePicker
                date={parseDateSafe(fromValue)}
                onDateChange={setFromDate}
                placeholder="Seleccionar fecha"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
              <DatePicker
                date={parseDateSafe(toValue)}
                onDateChange={setToDate}
                placeholder="Seleccionar fecha"
              />
            </div>
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














