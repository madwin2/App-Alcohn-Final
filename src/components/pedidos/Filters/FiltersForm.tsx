import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FabricationState, SaleState, ShippingState, StampType } from '@/lib/types/index';
import { DatePicker } from '@/components/ui/date-picker';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import { Calendar, Filter, X, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const filtersSchema = z.object({
  dateRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  fabrication: z
    .array(
      z.enum([
        'SIN_HACER',
        'HACIENDO',
        'VERIFICAR',
        'HECHO',
        'REHACER',
        'RETOCAR',
        'PROGRAMADO',
      ])
    )
    .optional(),
  sale: z
    .array(z.enum(['SEÑADO', 'FOTO_ENVIADA', 'TRANSFERIDO', 'DEUDOR']))
    .optional(),
  shipping: z
    .array(
      z.enum([
        'SIN_ENVIO',
        'HACER_ETIQUETA',
        'ETIQUETA_LISTA',
        'DESPACHADO',
        'SEGUIMIENTO_ENVIADO',
      ])
    )
    .optional(),
  types: z.array(z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE'] as any)).optional(),
  channels: z
    .array(z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MAIL'] as any))
    .optional(),
  uploaders: z.array(z.string()).optional(),
});

type FiltersFormData = z.infer<typeof filtersSchema>;

interface FiltersFormProps {
  onSubmit: (data: FiltersFormData) => void;
  onClear: () => void;
  initialData?: FiltersFormData;
}

const fabricationOptions: { value: FabricationState; label: string }[] = [
  { value: 'SIN_HACER', label: 'Sin Hacer' },
  { value: 'HACIENDO', label: 'Haciendo' },
  { value: 'VERIFICAR', label: 'Verificar' },
  { value: 'HECHO', label: 'Hecho' },
  { value: 'REHACER', label: 'Rehacer' },
  { value: 'RETOCAR', label: 'Retocar' },
  { value: 'PROGRAMADO', label: 'Programado' },
];

const saleOptions: { value: SaleState; label: string }[] = [
  { value: 'SEÑADO', label: 'Señado' },
  { value: 'FOTO_ENVIADA', label: 'Foto Enviada' },
  { value: 'TRANSFERIDO', label: 'Transferido' },
  { value: 'DEUDOR', label: 'Deudor' },
];

const shippingOptions: { value: ShippingState; label: string }[] = [
  { value: 'SIN_ENVIO', label: 'Sin Envío' },
  { value: 'HACER_ETIQUETA', label: 'Hacer Etiqueta' },
  { value: 'ETIQUETA_LISTA', label: 'Etiqueta Lista' },
  { value: 'DESPACHADO', label: 'Despachado' },
  { value: 'SEGUIMIENTO_ENVIADO', label: 'Seguimiento Enviado' },
];

const typeOptions: { value: StampType; label: string }[] = [
  { value: '3MM' as any, label: '3mm' },
  { value: 'ALIMENTO' as any, label: 'Alimento' },
  { value: 'CLASICO' as any, label: 'Clásico' },
  { value: 'ABC' as any, label: 'ABC' },
  { value: 'LACRE' as any, label: 'Lacre' },
];

const channelOptions = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'MAIL', label: 'Mail' },
];

// uploaderOptions se obtendrá dinámicamente desde la BD

function Chip({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium border transition-all ${
        selected
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border hover:bg-muted hover:border-primary/30'
      }`}
    >
      {children}
    </button>
  );
}

export function FiltersForm({ onSubmit, onClear, initialData }: FiltersFormProps) {
  const [uploaderOptions, setUploaderOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Cargar usuarios aprobados al montar el componente
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        const users = await getApprovedUsers();
        setUploaderOptions(users);
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const { register, handleSubmit, watch, setValue, reset } = useForm<FiltersFormData>({
    resolver: zodResolver(filtersSchema),
    defaultValues: initialData || {
      dateRange: undefined,
      fabrication: [],
      sale: [],
      shipping: [],
      types: [],
      channels: [],
      uploaders: [],
    },
  });

  const watchedFabrication = watch('fabrication') || [];
  const watchedSale = watch('sale') || [];
  const watchedShipping = watch('shipping') || [];
  const watchedTypes = watch('types') || [];
  const watchedChannels = watch('channels') || [];
  const watchedUploaders = watch('uploaders') || [];

  const toggleArrayValue = (field: keyof FiltersFormData, value: any) => {
    const current = (watch(field) as any[]) || [];
    if (current.includes(value)) setValue(field, current.filter((v) => v !== value) as any);
    else setValue(field, [...current, value] as any);
  };

  const handleClear = () => {
    reset({
      dateRange: undefined,
      fabrication: [],
      sale: [],
      shipping: [],
      types: [],
      channels: [],
      uploaders: [],
    });
    onClear();
  };

  // Helpers para fechas (guardamos como yyyy-MM-dd en hora local, sin conversión UTC)
  const dateToLocalString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const localStringToDate = (s: string): Date => {
    // Parsear yyyy-MM-dd como fecha local (no UTC)
    const [year, month, day] = s.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const parseDateSafe = (s: string | undefined): Date | undefined => {
    if (!s || typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return undefined;
    const d = localStringToDate(s);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const setFromDate = (d?: Date) => setValue('dateRange.from' as any, d ? dateToLocalString(d) : undefined);
  const setToDate = (d?: Date) => setValue('dateRange.to' as any, d ? dateToLocalString(d) : undefined);

  const fromValue = watch('dateRange.from');
  const toValue = watch('dateRange.to');
  const monthOptions = getMonthOptions(24);

  const setQuickRange = (preset: 'hoy' | 'ayer' | 'esta_semana') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === 'hoy') {
      const s = dateToLocalString(today);
      setValue('dateRange' as any, { from: s, to: s });
      return;
    }
    if (preset === 'ayer') {
      const ayer = new Date(today);
      ayer.setDate(ayer.getDate() - 1);
      const s = dateToLocalString(ayer);
      setValue('dateRange' as any, { from: s, to: s });
      return;
    }
    if (preset === 'esta_semana') {
      const day = today.getDay();
      const lunes = new Date(today);
      lunes.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      setValue('dateRange' as any, { from: dateToLocalString(lunes), to: dateToLocalString(domingo) });
    }
  };

  const setMonthRange = (valueKey: string) => {
    const [y, m] = valueKey.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    setFromDate(from);
    setToDate(to);
    setValue('dateRange.from' as any, dateToLocalString(from));
    setValue('dateRange.to' as any, dateToLocalString(to));
  };

  const selectedMonthValue = (() => {
    const from = parseDateSafe(fromValue);
    const to = parseDateSafe(toValue);
    if (!from || !to || from.getDate() !== 1) return '';
    const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    if (dateToLocalString(to) !== dateToLocalString(lastDay)) return '';
    return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
  })();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-2">
      {/* Rango de fechas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-semibold">Rango de fechas</Label>
        </div>
        <div className="space-y-3 pl-6">
          <div className="flex flex-wrap gap-2">
            <Chip selected={false} onToggle={() => setQuickRange('hoy')}>
              Hoy
            </Chip>
            <Chip selected={false} onToggle={() => setQuickRange('ayer')}>
              Ayer
            </Chip>
            <Chip selected={false} onToggle={() => setQuickRange('esta_semana')}>
              Esta semana
            </Chip>
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
              <DatePicker date={parseDateSafe(fromValue)} onDateChange={setFromDate} placeholder="Seleccionar fecha" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
              <DatePicker date={parseDateSafe(toValue)} onDateChange={setToDate} placeholder="Seleccionar fecha" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t"></div>

      {/* Estados de fabricación */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Estado de fabricación</Label>
        <div className="flex flex-wrap gap-2">
          {fabricationOptions.map((o) => (
            <Chip key={o.value} selected={watchedFabrication.includes(o.value)} onToggle={() => toggleArrayValue('fabrication', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Estados de venta */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Estado de venta</Label>
        <div className="flex flex-wrap gap-2">
          {saleOptions.map((o) => (
            <Chip key={o.value} selected={watchedSale.includes(o.value)} onToggle={() => toggleArrayValue('sale', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Estados de envío */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Estado de envío</Label>
        <div className="flex flex-wrap gap-2">
          {shippingOptions.map((o) => (
            <Chip key={o.value} selected={watchedShipping.includes(o.value)} onToggle={() => toggleArrayValue('shipping', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Tipo */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Tipo</Label>
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((o) => (
            <Chip key={o.value} selected={watchedTypes.includes(o.value)} onToggle={() => toggleArrayValue('types', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Medio de contacto */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Medio de contacto</Label>
        <div className="flex flex-wrap gap-2">
          {channelOptions.map((o) => (
            <Chip key={o.value} selected={watchedChannels.includes(o.value)} onToggle={() => toggleArrayValue('channels', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="border-t"></div>

      {/* Quién lo subió */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Quién lo subió</Label>
        {loadingUsers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando usuarios...
          </div>
        ) : uploaderOptions.length === 0 ? (
          <div className="text-sm text-muted-foreground pl-6">No hay usuarios disponibles</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uploaderOptions.map((user) => (
              <Chip key={user.id} selected={watchedUploaders.includes(user.name)} onToggle={() => toggleArrayValue('uploaders', user.name)}>
                {user.name}
              </Chip>
            ))}
          </div>
        )}
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
