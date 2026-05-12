import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Order, StampType, FabricationState, SaleState, ShippingState, ItemType, SoldadorPower, AbecedarioCase } from '@/lib/types/index';
import { useState, useEffect, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { fetchPreciosResolverInputForCotizacion } from '@/lib/supabase/services/preciosPro.service';
import type { PreciosResolverInput } from '@/lib/precios/resolverPrecioSello';
import { cotizarSelloRectangularCm, mmPedidoAcm, parseMedidaMmAString } from '@/lib/precios/cotizacionMedida';

const addStampSchema = z.object({
  itemType: z.enum(['SELLO', 'ABECEDARIO', 'SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA']),
  designName: z.string().optional(),
  requestedWidthMm: z.number().min(1, 'La medida debe ser mayor a 0'),
  requestedHeightMm: z.number().min(1, 'La medida debe ser mayor a 0'),
  stampType: z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE']),
  soldadorPower: z.enum(['100W', '200W']).optional(),
  abecedarioTipografia: z.string().optional(),
  abecedarioAlturaMm: z.number().optional(),
  abecedarioCase: z.enum(['MAYUSCULA', 'MINUSCULA', 'AMBAS']).optional(),
  abecedarioExtraLetters: z.string().optional(),
  notes: z.string().optional(),
  itemValue: z.number().min(0, 'El valor debe ser mayor o igual a 0'),
  depositValueItem: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  fabricationState: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR', 'PROGRAMADO']),
  saleState: z.enum(['SEÑADO', 'FOTO_ENVIADA', 'TRANSFERIDO', 'DEUDOR']),
  shippingState: z.enum(['SIN_ENVIO', 'HACER_ETIQUETA', 'ETIQUETA_LISTA', 'DESPACHADO', 'SEGUIMIENTO_ENVIADO']),
  isPriority: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.itemType === 'SELLO' && !data.designName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El nombre del diseño es requerido',
      path: ['designName'],
    });
  }
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

const itemTypeOptions: { value: ItemType; label: string }[] = [
  { value: 'SELLO', label: 'Sello' },
  { value: 'ABECEDARIO', label: 'Abecedario' },
  { value: 'SOLDADOR', label: 'Soldador Eléctrico' },
  { value: 'MANGO_GOLPE', label: 'Mango de Golpe' },
  { value: 'BASE_REMACHADORA', label: 'Base para Remachadora' },
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

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset, control } = useForm<AddStampFormData>({
    resolver: zodResolver(addStampSchema),
    defaultValues: {
      itemType: 'SELLO',
      stampType: 'CLASICO',
      fabricationState: 'SIN_HACER',
      saleState: 'SEÑADO',
      shippingState: 'SIN_ENVIO',
      isPriority: false,
      itemValue: 0,
      depositValueItem: 0,
      requestedHeightMm: 1,
    },
  });

  const [measureTick, setMeasureTick] = useState(0);
  const [preciosCotizacion, setPreciosCotizacion] = useState<PreciosResolverInput | null>(null);

  useEffect(() => {
    void fetchPreciosResolverInputForCotizacion()
      .then(setPreciosCotizacion)
      .catch(() => setPreciosCotizacion(null));
  }, []);

  const watchedValues = watch(['itemValue', 'depositValueItem']);
  const selectedItemType = watch('itemType');
  const itemValue = watchedValues[0] || 0;
  const depositValue = watchedValues[1] || 0;
  const restante = Math.max(0, itemValue - depositValue);

  const wMmWatch = useWatch({ control, name: 'requestedWidthMm' });
  const hMmWatch = useWatch({ control, name: 'requestedHeightMm' });

  useEffect(() => {
    if (selectedItemType !== 'SELLO') return;
    if (!preciosCotizacion || measureTick === 0) return;
    const w = Number(wMmWatch) || 0;
    const h = Number(hMmWatch) || 0;
    if (w < 1 || h < 1) return;
    const { anchoCm, altoCm } = mmPedidoAcm(w, h);
    const c = cotizarSelloRectangularCm(anchoCm, altoCm, preciosCotizacion);
    if (c) setValue('itemValue', c.precioTransferencia);
  }, [measureTick, preciosCotizacion, selectedItemType, wMmWatch, hMmWatch, setValue]);

  const aplicarMedidaDesdeTexto = useCallback(
    (value: string) => {
      setMeasureInput(value);
      const parsed = parseMedidaMmAString(value);
      if (parsed) {
        setValue('requestedWidthMm', parsed.anchoMm);
        setValue('requestedHeightMm', parsed.altoMm);
        setMeasureTick((t) => t + 1);
      } else if (value.trim() === '') {
        setValue('requestedWidthMm', 1);
        setValue('requestedHeightMm', 1);
      }
    },
    [setValue],
  );

  useEffect(() => {
    if (selectedItemType === 'SOLDADOR') {
      setValue('itemValue', 75000);
    } else if (selectedItemType === 'MANGO_GOLPE') {
      setValue('itemValue', 25000);
    } else if (selectedItemType === 'BASE_REMACHADORA') {
      setValue('itemValue', 40000);
    }
    if (selectedItemType !== 'SELLO') {
      setValue('requestedWidthMm', 1);
      setValue('requestedHeightMm', 1);
      setValue('stampType', 'CLASICO');
    }
  }, [selectedItemType, setValue]);

  // Resetear el campo de medida cuando se abre el diálogo
  useEffect(() => {
    if (open) {
      setMeasureInput('');
      setMeasureTick(0);
      setValue('requestedWidthMm', 1);
      setValue('requestedHeightMm', 1);
    }
  }, [open, setValue]);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const onSubmit = async (data: AddStampFormData) => {
    try {
      setIsSubmitting(true);
      
      let width = 1;
      let height = 1;
      if (data.itemType === 'SELLO') {
        const parsed = parseMedidaMmAString(measureInput);
        if (!parsed) {
          toast({
            title: "Error",
            description: "Formato de medida inválido. Usá milímetros, ej: 40×40 o 35",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
        width = parsed.anchoMm;
        height = parsed.altoMm;
      }
      
      await onAddStamp(order.id, {
        itemType: data.itemType,
        designName: data.itemType === 'SELLO' ? (data.designName || '') : '',
        requestedWidthMm: width,
        requestedHeightMm: height,
        stampType: data.stampType,
        itemConfig: {
          soldadorPower: data.soldadorPower,
          abecedarioTipografia: data.abecedarioTipografia,
          abecedarioAlturaMm: data.abecedarioAlturaMm,
          abecedarioCase: data.abecedarioCase,
          abecedarioExtraLetters: data.abecedarioExtraLetters,
        },
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

      const itemLabel = data.itemType === 'ABECEDARIO'
        ? 'abecedario'
        : data.itemType === 'SOLDADOR'
        ? 'soldador'
        : data.itemType === 'MANGO_GOLPE'
        ? 'mango de golpe'
        : data.itemType === 'BASE_REMACHADORA'
        ? 'base remachadora'
        : 'sello';
      toast({
        title: "¡Ítem agregado!",
        description: `Se ha agregado ${itemLabel} al pedido`,
      });

      // Reset form
      reset();
      setFiles({});
      setMeasureInput('');
      setMeasureTick(0);
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
            Agregar Ítem al Pedido
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
                <Label>Tipo de ítem</Label>
                <Select value={watch('itemType')} onValueChange={(value) => setValue('itemType', value as ItemType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo de ítem" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedItemType === 'SELLO' && (
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
              )}
              {selectedItemType === 'SELLO' && (
                <div>
                  <Label htmlFor="requestedWidthMm">Medida (mm) *</Label>
                  <Input
                    id="requestedWidthMm"
                    type="text"
                    placeholder="Ej: 40×40 o 35"
                    value={measureInput}
                    onChange={(e) => aplicarMedidaDesdeTexto(e.target.value)}
                    className={errors.requestedWidthMm ? 'border-red-500' : ''}
                  />
                  {errors.requestedWidthMm && (
                    <p className="text-xs text-red-500 mt-1">{errors.requestedWidthMm.message}</p>
                  )}
                  {measureInput && !parseMedidaMmAString(measureInput) && (
                    <p className="text-xs text-yellow-500 mt-1">Formato: 40×40 o 35 (milímetros)</p>
                  )}
                  {preciosCotizacion && measureTick > 0 && Number(wMmWatch) >= 1 && Number(hMmWatch) >= 1 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Valor sugerido por lista (transferencia); editable.
                    </p>
                  ) : null}
                </div>
              )}
              <div>
                {selectedItemType === 'SELLO' && (
                  <>
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
                  </>
                )}
                {selectedItemType === 'SOLDADOR' && (
                  <>
                    <Label>Potencia</Label>
                    <Select onValueChange={(value) => setValue('soldadorPower', value as SoldadorPower)} value={watch('soldadorPower') || '100W'}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar potencia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100W">100W</SelectItem>
                        <SelectItem value="200W">200W</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                {selectedItemType === 'ABECEDARIO' && (
                  <>
                    <Label>Tipografía</Label>
                    <Input value={watch('abecedarioTipografia') || ''} onChange={(e) => setValue('abecedarioTipografia', e.target.value)} />
                  </>
                )}
              </div>
              {selectedItemType === 'ABECEDARIO' && (
                <>
                  <div>
                    <Label>Altura de letra (mm)</Label>
                    <Input type="number" value={watch('abecedarioAlturaMm') || ''} onChange={(e) => setValue('abecedarioAlturaMm', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Mayús / Minús</Label>
                    <Select onValueChange={(value) => setValue('abecedarioCase', value as AbecedarioCase)} value={watch('abecedarioCase') || 'MAYUSCULA'}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAYUSCULA">Mayúscula</SelectItem>
                        <SelectItem value="MINUSCULA">Minúscula</SelectItem>
                        <SelectItem value="AMBAS">Ambas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Letras extras</Label>
                    <Input value={watch('abecedarioExtraLetters') || ''} onChange={(e) => setValue('abecedarioExtraLetters', e.target.value)} />
                  </div>
                </>
              )}
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
                  disabled={selectedItemType === 'SOLDADOR' || selectedItemType === 'MANGO_GOLPE' || selectedItemType === 'BASE_REMACHADORA'}
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
              {isSubmitting ? 'Agregando...' : 'Agregar Ítem'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}





