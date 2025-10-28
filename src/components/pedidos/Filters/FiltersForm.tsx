import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FabricationState, SaleState, ShippingState, StampType } from '@/lib/types/index';
import { DatePicker } from '@/components/ui/date-picker';

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

const uploaderOptions = ['Julia', 'Roberto', 'Patricia'];

function Chip({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center rounded px-2 py-1 text-xs border transition-colors ${
        selected
          ? 'bg-white border-white text-gray-900'
          : 'bg-transparent border-white/10 text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export function FiltersForm({ onSubmit, onClear, initialData }: FiltersFormProps) {
  const { register, handleSubmit, watch, setValue, reset } = useForm<FiltersFormData>({
    resolver: zodResolver(filtersSchema),
    defaultValues: initialData || {
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
      fabrication: [],
      sale: [],
      shipping: [],
      types: [],
      channels: [],
      uploaders: [],
    });
    onClear();
  };

  // Helpers para fechas (guardamos como yyyy-MM-dd)
  const setFromDate = (d?: Date) => setValue('dateRange.from' as any, d ? d.toISOString().slice(0, 10) : undefined);
  const setToDate = (d?: Date) => setValue('dateRange.to' as any, d ? d.toISOString().slice(0, 10) : undefined);

  const fromValue = watch('dateRange.from');
  const toValue = watch('dateRange.to');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Rango de fechas */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Rango de fechas</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <DatePicker date={fromValue ? new Date(fromValue) : undefined} onDateChange={setFromDate} placeholder="mm/dd/yy" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <DatePicker date={toValue ? new Date(toValue) : undefined} onDateChange={setToDate} placeholder="mm/dd/yy" />
          </div>
        </div>
      </div>

      {/* Estados de fabricación */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Estado de fabricación</Label>
        <div className="grid grid-cols-3 gap-2">
          {fabricationOptions.map((o) => (
            <Chip key={o.value} selected={watchedFabrication.includes(o.value)} onToggle={() => toggleArrayValue('fabrication', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Estados de venta */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Estado de venta</Label>
        <div className="grid grid-cols-3 gap-2">
          {saleOptions.map((o) => (
            <Chip key={o.value} selected={watchedSale.includes(o.value)} onToggle={() => toggleArrayValue('sale', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Estados de envío */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Estado de envío</Label>
        <div className="grid grid-cols-3 gap-2">
          {shippingOptions.map((o) => (
            <Chip key={o.value} selected={watchedShipping.includes(o.value)} onToggle={() => toggleArrayValue('shipping', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Tipo */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Tipo</Label>
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((o) => (
            <Chip key={o.value} selected={watchedTypes.includes(o.value)} onToggle={() => toggleArrayValue('types', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Medio de contacto */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Medio de contacto</Label>
        <div className="flex flex-wrap gap-2">
          {channelOptions.map((o) => (
            <Chip key={o.value} selected={watchedChannels.includes(o.value)} onToggle={() => toggleArrayValue('channels', o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Quién lo subió */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Quién lo subió</Label>
        <div className="flex flex-wrap gap-2">
          {uploaderOptions.map((name) => (
            <Chip key={name} selected={watchedUploaders.includes(name)} onToggle={() => toggleArrayValue('uploaders', name)}>
              {name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={handleClear} className="text-xs">
          Limpiar
        </Button>
        <Button type="submit" className="text-xs">
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}
