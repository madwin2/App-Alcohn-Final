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

// Schema para el paso 1 (Información del cliente)
const customerSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1, 'El nombre es requerido'),
    lastName: z.string().min(1, 'El apellido es requerido'),
    phoneE164: z.string().min(1, 'El teléfono es requerido'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MAIL', 'OTRO']),
  }),
});

// Schema para el paso 2 (Información del pedido)
const orderSchema = z.object({
  order: z.object({
    designName: z.string().min(1, 'El nombre del diseño es requerido'),
    requestedWidthMm: z.number().min(1, 'La medida debe ser mayor a 0'),
    stampType: z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE']),
    notes: z.string().optional(),
  }),
  values: z.object({
    totalValue: z.number().min(0, 'El valor total debe ser mayor o igual a 0'),
    depositValue: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  }),
  shipping: z.object({
    carrier: z.enum(['ANDREANI', 'CORREO_ARGENTINO', 'VIA_CARGO', 'OTRO']),
  }),
  states: z.object({
    fabrication: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'PRIORIDAD', 'RETOCAR']),
  }),
});

type CustomerFormData = z.infer<typeof customerSchema>;
type OrderFormData = z.infer<typeof orderSchema>;

interface NewOrderStepFormProps {
  currentStep: number;
  onStepSubmit: (data: any, step: number) => void;
  onCancel: () => void;
  onBack: () => void;
  onAddDesign: () => void;
  initialData: Partial<NewOrderFormData>;
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
  { value: 'PRIORIDAD', label: 'Prioridad' },
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

export function NewOrderStepForm({ currentStep, onStepSubmit, onCancel, onBack, onAddDesign, initialData }: NewOrderStepFormProps) {
  const [files, setFiles] = useState<{
    base?: File;
    vector?: File;
    photo?: File;
  }>({});

  // Formulario para el paso 1 (Cliente)
  const customerForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer: {
        channel: 'WHATSAPP',
        ...initialData.customer,
      },
    },
  });

  // Formulario para el paso 2 (Pedido)
  const orderForm = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order: {
        stampType: 'CLASICO',
        ...initialData.order,
      },
      values: {
        ...initialData.values,
      },
      shipping: {
        carrier: 'ANDREANI',
        ...initialData.shipping,
      },
      states: {
        fabrication: 'SIN_HACER',
        ...initialData.states,
      },
    },
  });

  const watchedValues = orderForm.watch(['values.totalValue', 'values.depositValue']);
  const totalValue = watchedValues[0] || 0;
  const depositValue = watchedValues[1] || 0;
  const restante = Math.max(0, totalValue - depositValue);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const handleCustomerSubmit = (data: CustomerFormData) => {
    onStepSubmit(data, 1);
  };

  const handleOrderSubmit = (data: OrderFormData) => {
    const finalData = {
      ...data,
      files,
    };
    onStepSubmit(finalData, 2);
  };

  const handleAddDesign = () => {
    // Primero guardar los datos del paso 2
    const currentData = orderForm.getValues();
    const finalData = {
      ...currentData,
      files,
    };
    onStepSubmit(finalData, 2);
    // Luego avanzar al paso 3
    onAddDesign();
  };

  if (currentStep === 1) {
    return (
      <form onSubmit={customerForm.handleSubmit(handleCustomerSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Información del contacto</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">Nombre *</Label>
              <Input
                id="firstName"
                {...customerForm.register('customer.firstName')}
                className={customerForm.formState.errors.customer?.firstName ? 'border-red-500' : ''}
              />
              {customerForm.formState.errors.customer?.firstName && (
                <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.customer.firstName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName">Apellido *</Label>
              <Input
                id="lastName"
                {...customerForm.register('customer.lastName')}
                className={customerForm.formState.errors.customer?.lastName ? 'border-red-500' : ''}
              />
              {customerForm.formState.errors.customer?.lastName && (
                <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.customer.lastName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phoneE164">Teléfono *</Label>
              <Input
                id="phoneE164"
                placeholder="+5491123456789"
                {...customerForm.register('customer.phoneE164')}
                className={customerForm.formState.errors.customer?.phoneE164 ? 'border-red-500' : ''}
              />
              {customerForm.formState.errors.customer?.phoneE164 && (
                <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.customer.phoneE164.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...customerForm.register('customer.email')}
                className={customerForm.formState.errors.customer?.email ? 'border-red-500' : ''}
              />
              {customerForm.formState.errors.customer?.email && (
                <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.customer.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="channel">Canal de contacto</Label>
              <Select onValueChange={(value) => customerForm.setValue('customer.channel', value as any)}>
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

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">
            Continuar a Pedido
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={orderForm.handleSubmit(handleOrderSubmit)} className="space-y-4">
      {/* Diseño */}
      <div className="space-y-3">
        <h3 className="text-base font-medium">Diseño</h3>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2">
            <Input
              id="designName"
              placeholder="Nombre del Diseño *"
              {...orderForm.register('order.designName')}
              className={orderForm.formState.errors.order?.designName ? 'border-red-500' : ''}
            />
            {orderForm.formState.errors.order?.designName && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order.designName.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Input
              id="requestedWidthMm"
              type="number"
              placeholder="Medida *"
              {...orderForm.register('order.requestedWidthMm', { valueAsNumber: true })}
              className={orderForm.formState.errors.order?.requestedWidthMm ? 'border-red-500' : ''}
            />
            {orderForm.formState.errors.order?.requestedWidthMm && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order.requestedWidthMm.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Select onValueChange={(value) => orderForm.setValue('order.stampType', value as StampType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Sello" />
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
          <div className="col-span-6">
            <Textarea
              id="notes"
              {...orderForm.register('order.notes')}
              placeholder="Notas adicionales sobre el pedido..."
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Valores */}
      <div className="space-y-3">
        <h3 className="text-base font-medium">Valores</h3>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2">
            <Input
              id="totalValue"
              type="number"
              placeholder="Valor Total *"
              {...orderForm.register('values.totalValue', { valueAsNumber: true })}
              className={orderForm.formState.errors.values?.totalValue ? 'border-red-500' : ''}
            />
            {orderForm.formState.errors.values?.totalValue && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values.totalValue.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Input
              id="depositValue"
              type="number"
              placeholder="Seña"
              {...orderForm.register('values.depositValue', { valueAsNumber: true })}
              className={orderForm.formState.errors.values?.depositValue ? 'border-red-500' : ''}
            />
            {orderForm.formState.errors.values?.depositValue && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values.depositValue.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Input
              value={`$${restante.toLocaleString()}`}
              disabled
              className="bg-muted"
              placeholder="Restante"
            />
          </div>
        </div>
      </div>

      {/* Transportista y Estado de Fabricación */}
      <div className="space-y-3">
        <h3 className="text-base font-medium">Transportista y Estado</h3>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-3">
            <Select onValueChange={(value) => orderForm.setValue('shipping.carrier', value as ShippingCarrier)}>
              <SelectTrigger>
                <SelectValue placeholder="Transportista" />
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
          <div className="col-span-3">
            <Select onValueChange={(value) => orderForm.setValue('states.fabrication', value as FabricationState)}>
              <SelectTrigger>
                <SelectValue placeholder="Estado de Fabricación" />
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
        </div>
      </div>

      {/* Archivos */}
      <div className="space-y-3">
        <h3 className="text-base font-medium">Archivos</h3>
        <div className="grid grid-cols-6 gap-3">
          {(['base', 'vector'] as const).map((type) => (
            <div key={type} className="col-span-3 space-y-2">
              <Label className="capitalize">
                {type === 'base' ? 'Archivo Base' : 'Archivo Vector'}
              </Label>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-3 text-center">
                {files[type] ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium truncate">{files[type]?.name}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleFileChange(type, undefined)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Subir archivo</p>
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
      <div className="flex justify-between pt-4 border-t">
        <Button type="button" variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleAddDesign}>
            Agregar Diseño
          </Button>
          <Button type="submit">
            Crear Pedido
          </Button>
        </div>
      </div>
    </form>
  );

  // Paso 3: Agregar Diseño (igual al paso 2 pero para diseños adicionales)
  if (currentStep === 3) {
    return (
      <form onSubmit={orderForm.handleSubmit(handleOrderSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Agregar Diseño</h3>
          
          {/* Diseño */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Diseño</h3>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2">
                <Input
                  id="designName"
                  placeholder="Nombre del Diseño * (Ej: Logo Empresa ABC)"
                  {...orderForm.register('order.designName')}
                  className={orderForm.formState.errors.order?.designName ? 'border-red-500' : ''}
                />
                {orderForm.formState.errors.order?.designName && (
                  <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order?.designName?.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Input
                  id="requestedWidthMm"
                  type="number"
                  placeholder="Medida (mm) * (Ej: 25)"
                  {...orderForm.register('order.requestedWidthMm', { valueAsNumber: true })}
                  className={orderForm.formState.errors.order?.requestedWidthMm ? 'border-red-500' : ''}
                />
                {orderForm.formState.errors.order?.requestedWidthMm && (
                  <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order?.requestedWidthMm?.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Select onValueChange={(value) => orderForm.setValue('order.stampType', value as StampType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de Sello" />
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
              <div className="col-span-6">
                <Textarea
                  id="notes"
                  {...orderForm.register('order.notes')}
                  placeholder="Notas adicionales sobre el diseño..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Valores */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Valores</h3>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2">
                <Input
                  id="totalValue"
                  type="number"
                  placeholder="Valor Total *"
                  {...orderForm.register('values.totalValue', { valueAsNumber: true })}
                  className={orderForm.formState.errors.values?.totalValue ? 'border-red-500' : ''}
                />
                {orderForm.formState.errors.values?.totalValue && (
                  <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values?.totalValue?.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Input
                  id="depositValue"
                  type="number"
                  placeholder="Seña"
                  {...orderForm.register('values.depositValue', { valueAsNumber: true })}
                  className={orderForm.formState.errors.values?.depositValue ? 'border-red-500' : ''}
                />
                {orderForm.formState.errors.values?.depositValue && (
                  <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values?.depositValue?.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Input
                  value={`$${restante.toLocaleString()}`}
                  disabled
                  className="bg-muted"
                  placeholder="Restante"
                />
              </div>
            </div>
          </div>

          {/* Transportista y Estado */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Transportista y Estado</h3>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <Select onValueChange={(value) => orderForm.setValue('shipping.carrier', value as ShippingCarrier)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Transportista" />
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
              <div className="col-span-3">
                <Select onValueChange={(value) => orderForm.setValue('states.fabrication', value as FabricationState)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Estado de Fabricación" />
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
            </div>
          </div>

          {/* Archivos */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Archivos</h3>
            <div className="grid grid-cols-6 gap-3">
              {(['base', 'vector'] as const).map((type) => (
                <div key={type} className="col-span-3 space-y-2">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-3 text-center">
                    {files[type] ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium truncate">{files[type]?.name}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileChange(type, undefined)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Quitar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Subir archivo</p>
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
        </div>

        {/* Botones */}
        <div className="flex justify-between pt-4 border-t">
          <Button type="button" variant="outline" onClick={onBack}>
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onAddDesign}>
              Agregar Otro Diseño
            </Button>
            <Button type="submit">
              Finalizar Pedido
            </Button>
          </div>
        </div>
      </form>
    );
  }
}
