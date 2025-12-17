import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Order, StampType, FabricationState, SaleState, ShippingState } from '@/lib/types/index';
import { useState, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const addStampSchema = z.object({
  designName: z.string().min(1, 'El nombre del diseño es requerido'),
  requestedWidthMm: z.number().min(1, 'La medida debe ser mayor a 0'),
  stampType: z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE']),
  notes: z.string().optional(),
  itemValue: z.number().min(0, 'El valor debe ser mayor o igual a 0'),
  depositValueItem: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  fabricationState: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR', 'PROGRAMADO']),
  saleState: z.enum(['SEÑADO', 'FOTO_ENVIADA', 'TRANSFERIDO', 'DEUDOR']),
  shippingState: z.enum(['SIN_ENVIO', 'HACER_ETIQUETA', 'ETIQUETA_LISTA', 'DESPACHADO', 'SEGUIMIENTO_ENVIADO']),
  isPriority: z.boolean(),
});

type AddStampFormData = z.infer<typeof addStampSchema>;

interface AddStampDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  onAddStamp: (orderId: string, item: Partial<any>, files?: { base?: File; vector?: File; photo?: File }) => Promise<void>;
}

const stampTypeOptions = [
  { value: '3MM', label: '3MM' },
  { value: 'ALIMENTO', label: 'Alimento' },
  { value: 'CLASICO', label: 'Clásico' },
  { value: 'ABC', label: 'ABC' },
  { value: 'LACRE', label: 'Lacre' },
];

const fabricationOptions = [
  { value: 'SIN_HACER', label: 'Sin Hacer' },
  { value: 'HACIENDO', label: 'Haciendo' },
  { value: 'VERIFICAR', label: 'Verificar' },
  { value: 'HECHO', label: 'Hecho' },
  { value: 'REHACER', label: 'Rehacer' },
  { value: 'RETOCAR', label: 'Retocar' },
];

const saleOptions = [
  { value: 'SEÑADO', label: 'Señado' },
  { value: 'FOTO_ENVIADA', label: 'Foto Enviada' },
  { value: 'TRANSFERIDO', label: 'Transferido' },
  { value: 'DEUDOR', label: 'Deudor' },
];

const shippingOptions = [
  { value: 'SIN_ENVIO', label: 'Sin Envío' },
  { value: 'HACER_ETIQUETA', label: 'Hacer Etiqueta' },
  { value: 'ETIQUETA_LISTA', label: 'Etiqueta Lista' },
  { value: 'DESPACHADO', label: 'Despachado' },
  { value: 'SEGUIMIENTO_ENVIADO', label: 'Seguimiento Enviado' },
];

export function AddStampDialog({ open, onOpenChange, order, onAddStamp }: AddStampDialogProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<{
    base?: File;
    vector?: File;
    photo?: File;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [measureInput, setMeasureInput] = useState('');

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<AddStampFormData>({
    resolver: zodResolver(addStampSchema),
    defaultValues: {
      stampType: 'CLASICO',
      fabricationState: 'SIN_HACER',
      saleState: 'SEÑADO',
      shippingState: 'SIN_ENVIO',
      isPriority: false,
      itemValue: 0,
      depositValueItem: 0,
    },
  });

  const watchedValues = watch(['itemValue', 'depositValueItem']);
  const itemValue = watchedValues[0] || 0;
  const depositValue = watchedValues[1] || 0;
  const restante = Math.max(0, itemValue - depositValue);

  // Resetear el campo de medida cuando se abre el diálogo
  useEffect(() => {
    if (open) {
      setMeasureInput('');
      setValue('requestedWidthMm', 0);
    }
  }, [open, setValue]);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const onSubmit = async (data: AddStampFormData) => {
    try {
      setIsSubmitting(true);
      
      // Parsear la medida para obtener ancho y alto
      const match = measureInput.match(/^(\d+)(?:[xX×](\d+))?$/);
      if (!match) {
        toast({
          title: "Error",
          description: "Formato de medida inválido. Use el formato: 20x20 o 20",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      const width = parseInt(match[1]);
      const height = match[2] ? parseInt(match[2]) : width; // Si no hay altura, usar el mismo valor
      
      await onAddStamp(order.id, {
        designName: data.designName,
        requestedWidthMm: width,
        requestedHeightMm: height,
        stampType: data.stampType,
        notes: data.notes,
        itemValue: data.itemValue,
        depositValueItem: data.depositValueItem,
        restPaidAmountItem: restante,
        paidAmountItemCached: data.depositValueItem,
        balanceItemCached: restante,
        fabricationState: data.fabricationState,
        saleState: data.saleState,
        shippingState: data.shippingState,
        isPriority: data.isPriority,
        files: {},
        contact: {
          channel: order.items[0]?.contact?.channel || 'OTRO',
          phoneE164: order.customer.phoneE164,
        },
      }, files);

      toast({
        title: "¡Sello agregado!",
        description: `Se ha agregado el sello "${data.designName}" al pedido`,
      });

      // Reset form
      reset();
      setFiles({});
      setMeasureInput('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding stamp:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo agregar el sello",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-xl">
            Agregar Sello al Pedido
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Cliente: {order.customer.firstName} {order.customer.lastName}
          </p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Diseño */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Diseño</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="designName">Nombre del diseño *</Label>
                <Input
                  id="designName"
                  {...register('designName')}
                  className={errors.designName ? 'border-red-500' : ''}
                />
                {errors.designName && (
                  <p className="text-xs text-red-500 mt-1">{errors.designName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="requestedWidthMm">Medida (mm) *</Label>
                <Input
                  id="requestedWidthMm"
                  type="text"
                  placeholder="Ej: 20x20 o 20"
                  value={measureInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMeasureInput(value);
                    
                    // Parsear el valor: puede ser "20x20" o solo "20"
                    const match = value.match(/^(\d+)(?:[xX×](\d+))?$/);
                    if (match) {
                      const width = parseInt(match[1]);
                      const height = match[2] ? parseInt(match[2]) : width; // Si no hay altura, usar el mismo valor
                      
                      setValue('requestedWidthMm', width);
                    } else if (value === '') {
                      // Si está vacío, limpiar los valores
                      setValue('requestedWidthMm', 0);
                    }
                  }}
                  className={errors.requestedWidthMm ? 'border-red-500' : ''}
                />
                {errors.requestedWidthMm && (
                  <p className="text-xs text-red-500 mt-1">{errors.requestedWidthMm.message}</p>
                )}
                {measureInput && !measureInput.match(/^\d+([xX×]\d+)?$/) && (
                  <p className="text-xs text-yellow-500 mt-1">Formato: 20x20 o 20</p>
                )}
              </div>
              <div>
                <Label htmlFor="stampType">Tipo de sello</Label>
                <Select onValueChange={(value) => setValue('stampType', value as StampType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {stampTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="Notas adicionales sobre el sello..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Valores */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Valores</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="itemValue">Valor *</Label>
                <Input
                  id="itemValue"
                  type="number"
                  {...register('itemValue', { valueAsNumber: true })}
                  className={errors.itemValue ? 'border-red-500' : ''}
                />
                {errors.itemValue && (
                  <p className="text-xs text-red-500 mt-1">{errors.itemValue.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="depositValueItem">Seña</Label>
                <Input
                  id="depositValueItem"
                  type="number"
                  {...register('depositValueItem', { valueAsNumber: true })}
                  className={errors.depositValueItem ? 'border-red-500' : ''}
                />
                {errors.depositValueItem && (
                  <p className="text-xs text-red-500 mt-1">{errors.depositValueItem.message}</p>
                )}
              </div>
              <div>
                <Label>Restante</Label>
                <Input
                  value={`$${restante.toLocaleString()}`}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>
          </div>

          {/* Estados */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Estados</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="fabricationState">Fabricación</Label>
                <Select onValueChange={(value) => setValue('fabricationState', value as FabricationState)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {fabricationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="saleState">Venta</Label>
                <Select onValueChange={(value) => setValue('saleState', value as SaleState)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {saleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="shippingState">Envío</Label>
                <Select onValueChange={(value) => setValue('shippingState', value as ShippingState)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {shippingOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="isPriority" 
                    checked={watch('isPriority')}
                    onCheckedChange={(checked) => setValue('isPriority', !!checked)}
                  />
                  <Label htmlFor="isPriority" className="text-sm font-medium">
                    🔥 Sello Prioritario
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* Archivos */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Archivos</h3>
            <div className="grid grid-cols-3 gap-4">
              {(['base', 'vector', 'photo'] as const).map((type) => (
                <div key={type} className="space-y-2">
                  <Label className="capitalize">
                    {type === 'base' ? 'Base' : type === 'vector' ? 'Vector' : 'Foto sello'}
                  </Label>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    {files[type] ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium truncate">{files[type]?.name}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileChange(type, undefined)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Quitar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Subir archivo</p>
                        <input
                          type="file"
                          accept={type === 'photo' ? 'image/*' : 'image/*,.pdf,.ai,.eps'}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileChange(type, file);
                          }}
                          className="hidden"
                          id={`file-${type}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById(`file-${type}`)?.click()}
                        >
                          Seleccionar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Agregando...' : 'Agregar Sello'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}





