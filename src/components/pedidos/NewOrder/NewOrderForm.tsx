import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NewOrderFormData, FabricationState, SaleState, ShippingState, ShippingCarrier, ShippingServiceDest, ShippingOriginMethod, StampType } from '@/lib/types/index';
import { useState } from 'react';
import { Upload, X } from 'lucide-react';

const newOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1, 'El nombre es requerido'),
    lastName: z.string().min(1, 'El apellido es requerido'),
    phoneE164: z.string().min(1, 'El teléfono es requerido'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MAIL', 'OTRO']),
  }),
  order: z.object({
    designName: z.string().min(1, 'El nombre del diseño es requerido'),
    requestedWidthMm: z.number().min(1, 'El ancho debe ser mayor a 0'),
    requestedHeightMm: z.number().min(1, 'La altura debe ser mayor a 0'),
    stampType: z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE']),
    notes: z.string().optional(),
  }),
  values: z.object({
    totalValue: z.number().min(0, 'El valor total debe ser mayor o igual a 0'),
    depositValue: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  }),
  shipping: z.object({
    carrier: z.enum(['ANDREANI', 'CORREO_ARGENTINO', 'VIA_CARGO', 'OTRO']),
    service: z.enum(['DOMICILIO', 'SUCURSAL']),
    origin: z.enum(['RETIRO_EN_ORIGEN', 'ENTREGA_EN_SUCURSAL']),
  }),
  states: z.object({
    fabrication: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR']),
    sale: z.enum(['SEÑADO', 'FOTO_ENVIADA', 'TRANSFERIDO', 'DEUDOR']),
    shipping: z.enum(['SIN_ENVIO', 'HACER_ETIQUETA', 'ETIQUETA_LISTA', 'DESPACHADO', 'SEGUIMIENTO_ENVIADO']),
    isPriority: z.boolean(),
  }),
});

type FormData = z.infer<typeof newOrderSchema>;

interface NewOrderFormProps {
  onSubmit: (data: NewOrderFormData) => void;
}

const channelOptions = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'MAIL', label: 'Email' },
  { value: 'OTRO', label: 'Otro' },
];

const stampTypeOptions = [
  { value: '3MM', label: '3MM' },
  { value: 'ALIMENTO', label: 'Alimento' },
  { value: 'CLASICO', label: 'Clásico' },
  { value: 'ABC', label: 'ABC' },
  { value: 'LACRE', label: 'Lacre' },
];

const carrierOptions = [
  { value: 'ANDREANI', label: 'Andreani' },
  { value: 'CORREO_ARGENTINO', label: 'Correo Argentino' },
  { value: 'VIA_CARGO', label: 'Vía Cargo' },
  { value: 'OTRO', label: 'Otro' },
];

const serviceOptions = [
  { value: 'DOMICILIO', label: 'Domicilio' },
  { value: 'SUCURSAL', label: 'Sucursal' },
];

const originOptions = [
  { value: 'RETIRO_EN_ORIGEN', label: 'Retiro en origen' },
  { value: 'ENTREGA_EN_SUCURSAL', label: 'Entrega en sucursal' },
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

export function NewOrderForm({ onSubmit }: NewOrderFormProps) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: {
      customer: {
        channel: 'WHATSAPP',
      },
      order: {
        stampType: 'CLASICO',
      },
      values: {
        totalValue: 0,
        depositValue: 0,
      },
      shipping: {
        carrier: 'ANDREANI',
        service: 'DOMICILIO',
        origin: 'ENTREGA_EN_SUCURSAL',
      },
      states: {
        fabrication: 'SIN_HACER',
        sale: 'SEÑADO',
        shipping: 'SIN_ENVIO',
        isPriority: false,
      },
    },
  });

  const [files, setFiles] = useState<{
    base?: File;
    vector?: File;
    photo?: File;
  }>({});

  const watchedValues = watch(['values.totalValue', 'values.depositValue']);
  const restante = Math.max(0, watchedValues[0] - watchedValues[1]);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const handleFormSubmit = (data: FormData) => {
    const formData: NewOrderFormData = {
      ...data,
      files,
    };
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Información del cliente */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Información del cliente</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">Nombre *</Label>
            <Input
              id="firstName"
              {...register('customer.firstName')}
              className={errors.customer?.firstName ? 'border-red-500' : ''}
            />
            {errors.customer?.firstName && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.firstName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="lastName">Apellido *</Label>
            <Input
              id="lastName"
              {...register('customer.lastName')}
              className={errors.customer?.lastName ? 'border-red-500' : ''}
            />
            {errors.customer?.lastName && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.lastName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="phoneE164">Teléfono *</Label>
            <Input
              id="phoneE164"
              placeholder="+5491123456789"
              {...register('customer.phoneE164')}
              className={errors.customer?.phoneE164 ? 'border-red-500' : ''}
            />
            {errors.customer?.phoneE164 && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.phoneE164.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('customer.email')}
              className={errors.customer?.email ? 'border-red-500' : ''}
            />
            {errors.customer?.email && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.email.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="channel">Canal de contacto</Label>
            <Select onValueChange={(value) => setValue('customer.channel', value as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar canal" />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Información del pedido */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Información del pedido</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="designName">Nombre del diseño *</Label>
            <Input
              id="designName"
              {...register('order.designName')}
              className={errors.order?.designName ? 'border-red-500' : ''}
            />
            {errors.order?.designName && (
              <p className="text-xs text-red-500 mt-1">{errors.order.designName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="requestedWidthMm">Ancho (mm) *</Label>
            <Input
              id="requestedWidthMm"
              type="number"
              {...register('order.requestedWidthMm', { valueAsNumber: true })}
              className={errors.order?.requestedWidthMm ? 'border-red-500' : ''}
            />
            {errors.order?.requestedWidthMm && (
              <p className="text-xs text-red-500 mt-1">{errors.order.requestedWidthMm.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="requestedHeightMm">Altura (mm) *</Label>
            <Input
              id="requestedHeightMm"
              type="number"
              {...register('order.requestedHeightMm', { valueAsNumber: true })}
              className={errors.order?.requestedHeightMm ? 'border-red-500' : ''}
            />
            {errors.order?.requestedHeightMm && (
              <p className="text-xs text-red-500 mt-1">{errors.order.requestedHeightMm.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="stampType">Tipo de sello</Label>
            <Select onValueChange={(value) => setValue('order.stampType', value as StampType)}>
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
              {...register('order.notes')}
              placeholder="Notas adicionales sobre el pedido..."
            />
          </div>
        </div>
      </div>

      {/* Valores */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Valores</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="totalValue">Valor total *</Label>
            <Input
              id="totalValue"
              type="number"
              {...register('values.totalValue', { valueAsNumber: true })}
              className={errors.values?.totalValue ? 'border-red-500' : ''}
            />
            {errors.values?.totalValue && (
              <p className="text-xs text-red-500 mt-1">{errors.values.totalValue.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="depositValue">Seña</Label>
            <Input
              id="depositValue"
              type="number"
              {...register('values.depositValue', { valueAsNumber: true })}
              className={errors.values?.depositValue ? 'border-red-500' : ''}
            />
            {errors.values?.depositValue && (
              <p className="text-xs text-red-500 mt-1">{errors.values.depositValue.message}</p>
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

      {/* Envío */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Envío</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="carrier">Transportista</Label>
            <Select onValueChange={(value) => setValue('shipping.carrier', value as ShippingCarrier)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar transportista" />
              </SelectTrigger>
              <SelectContent>
                {carrierOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="service">Modalidad</Label>
            <Select onValueChange={(value) => setValue('shipping.service', value as ShippingServiceDest)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar modalidad" />
              </SelectTrigger>
              <SelectContent>
                {serviceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="origin">Origen</Label>
            <Select onValueChange={(value) => setValue('shipping.origin', value as ShippingOriginMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar origen" />
              </SelectTrigger>
              <SelectContent>
                {originOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Estados iniciales */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Estados iniciales</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="fabrication">Fabricación</Label>
            <Select onValueChange={(value) => setValue('states.fabrication', value as FabricationState)}>
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
            <Label htmlFor="sale">Venta</Label>
            <Select onValueChange={(value) => setValue('states.sale', value as SaleState)}>
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
            <Label htmlFor="shipping">Envío</Label>
            <Select onValueChange={(value) => setValue('states.shipping', value as ShippingState)}>
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
                id="isPriority-full" 
                checked={watch('states.isPriority')}
                onCheckedChange={(checked) => setValue('states.isPriority', !!checked)}
              />
              <Label htmlFor="isPriority-full" className="text-sm font-medium">
                🔥 Pedido Prioritario
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
                    <p className="text-sm font-medium">{files[type]?.name}</p>
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
                      accept="image/*,.pdf,.ai,.eps"
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
        <Button type="submit">
          Crear Pedido
        </Button>
      </div>
    </form>
  );
}
