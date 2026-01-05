import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { NewOrderFormData, FabricationState, SaleState, ShippingState, ShippingCarrier, ShippingServiceDest, ShippingOriginMethod, ShippingOption, StampType } from '@/lib/types/index';
import { useState, useEffect, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { findCustomerByPhone } from '@/lib/supabase/services/orders.service';

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
    requestedHeightMm: z.number().min(1, 'La medida debe ser mayor a 0').optional(),
    stampType: z.enum(['3MM', 'ALIMENTO', 'CLASICO', 'ABC', 'LACRE']),
    notes: z.string().optional(),
  }),
  values: z.object({
    totalValue: z.number().min(0, 'El valor total debe ser mayor o igual a 0'),
    depositValue: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  }),
  shipping: z.object({
    carrier: z.enum(['ANDREANI', 'CORREO_ARGENTINO', 'VIA_CARGO', 'OTRO']),
    service: z.enum(['DOMICILIO', 'SUCURSAL']).optional(),
  }),
  states: z.object({
    fabrication: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR', 'PROGRAMADO']),
    isPriority: z.boolean(),
    deadline: z.date().optional(),
  }),
});

type CustomerFormData = z.infer<typeof customerSchema>;
type OrderFormData = z.infer<typeof orderSchema>;

interface NewOrderStepFormProps {
  currentStep: number;
  onStepSubmit: (data: any, step: number, shouldCreateOrder?: boolean) => void;
  onCancel: () => void;
  onBack: () => void;
  onAddDesign: () => void;
  onCreateOrder?: (currentStepData?: any) => void;
  initialData: Partial<NewOrderFormData>;
  designsCount?: number;
  isSubmitting?: boolean;
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
  { value: 'ANDREANI_DOMICILIO', label: 'Andreani - Domicilio' },
  { value: 'ANDREANI_SUCURSAL', label: 'Andreani - Sucursal' },
  { value: 'CORREO_ARGENTINO_DOMICILIO', label: 'Correo Argentino - Domicilio' },
  { value: 'CORREO_ARGENTINO_SUCURSAL', label: 'Correo Argentino - Sucursal' },
  { value: 'VIA_CARGO_DOMICILIO', label: 'Vía Cargo - Domicilio' },
  { value: 'VIA_CARGO_SUCURSAL', label: 'Vía Cargo - Sucursal' },
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
  { value: 'PROGRAMADO', label: 'Programado' },
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

export function NewOrderStepForm({ currentStep, onStepSubmit, onCancel, onBack, onAddDesign, onCreateOrder, initialData, designsCount = 0, isSubmitting = false }: NewOrderStepFormProps) {
  const [files, setFiles] = useState<{
    base?: File;
    vector?: File;
    photo?: File;
  }>({});
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const phoneTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoFilledRef = useRef(false);
  const [measureInput, setMeasureInput] = useState<string>('');

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

  // Observar cambios en el teléfono para autocompletar
  const watchedPhone = customerForm.watch('customer.phoneE164');

  useEffect(() => {
    // Limpiar timeout anterior
    if (phoneTimeoutRef.current) {
      clearTimeout(phoneTimeoutRef.current);
    }

    // Si el teléfono está vacío o muy corto, no buscar
    if (!watchedPhone || watchedPhone.length < 8) {
      return;
    }

    // Esperar 500ms después de que el usuario deje de escribir
    phoneTimeoutRef.current = setTimeout(async () => {
      // Solo autocompletar si los campos están vacíos o si el usuario no ha modificado manualmente
      const currentFirstName = customerForm.getValues('customer.firstName');
      const currentLastName = customerForm.getValues('customer.lastName');
      
      // Si ya hay datos, no autocompletar (el usuario ya ingresó datos)
      if (currentFirstName || currentLastName) {
        return;
      }

      try {
        setIsLoadingCustomer(true);
        const customer = await findCustomerByPhone(watchedPhone);
        
        if (customer) {
          // Autocompletar los campos
          customerForm.setValue('customer.firstName', customer.firstName);
          customerForm.setValue('customer.lastName', customer.lastName);
          if (customer.email) {
            customerForm.setValue('customer.email', customer.email);
          }
          // El canal se mantiene en el valor por defecto o se puede mapear si hay un campo en Customer
          hasAutoFilledRef.current = true;
        }
      } catch (error) {
        console.error('Error buscando cliente:', error);
      } finally {
        setIsLoadingCustomer(false);
      }
    }, 500);

    return () => {
      if (phoneTimeoutRef.current) {
        clearTimeout(phoneTimeoutRef.current);
      }
    };
  }, [watchedPhone, customerForm]);

  // Formulario para el paso 2 (Pedido)
  const orderForm = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order: {
        stampType: 'CLASICO',
        ...initialData.order,
      },
      values: {
        depositValue: 10000,
        ...initialData.values,
      },
      shipping: {
        carrier: 'ANDREANI',
        service: 'DOMICILIO',
        ...initialData.shipping,
      },
      states: {
        fabrication: 'SIN_HACER',
        isPriority: false,
        deadline: undefined,
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
    // En el paso 2, cuando se hace submit, solo agregar el diseño (no crear pedido)
    const finalData = {
      ...data,
      files,
    };
    onStepSubmit(finalData, 2);
  };

  const handleAddDesign = () => {
    // Validar el formulario antes de agregar diseño
    orderForm.handleSubmit((data) => {
      const finalData = {
        ...data,
        files,
      };
      onStepSubmit(finalData, 2);
      // Limpiar el formulario para el siguiente diseño
      orderForm.reset({
        order: {
          stampType: 'CLASICO',
        },
        values: {
          totalValue: 0,
          depositValue: 10000,
        },
        shipping: {
          carrier: 'ANDREANI',
          service: 'DOMICILIO',
        },
        states: {
          fabrication: 'SIN_HACER',
          isPriority: false,
          deadline: undefined,
        },
      });
      setFiles({});
      setMeasureInput('');
      // Avanzar al paso 3
      onAddDesign();
    })();
  };

  if (currentStep === 1) {
    return (
      <form onSubmit={customerForm.handleSubmit(handleCustomerSubmit)} className="space-y-8">
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Información del contacto</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="phoneE164">Teléfono *</Label>
              <div className="relative">
                <Input
                  id="phoneE164"
                  placeholder="5491123456789"
                  {...customerForm.register('customer.phoneE164', {
                    onChange: (e) => {
                      // Limpiar el input: solo permitir números
                      const cleanedValue = e.target.value.replace(/\D/g, '');
                      customerForm.setValue('customer.phoneE164', cleanedValue, { shouldValidate: true });
                    },
                  })}
                  onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                    // Limpiar el valor pegado
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text');
                    const cleanedValue = pastedText.replace(/\D/g, '');
                    customerForm.setValue('customer.phoneE164', cleanedValue, { shouldValidate: true });
                  }}
                  className={customerForm.formState.errors.customer?.phoneE164 ? 'border-red-500' : ''}
                  disabled={isLoadingCustomer}
                />
                {isLoadingCustomer && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {customerForm.formState.errors.customer?.phoneE164 && (
                <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.customer.phoneE164.message}</p>
              )}
              {hasAutoFilledRef.current && (
                <p className="text-xs text-green-500 mt-1">✓ Datos del cliente cargados automáticamente</p>
              )}
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
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

        <div className="flex justify-end gap-4 pt-6 border-t">
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
    <form onSubmit={orderForm.handleSubmit(handleOrderSubmit)} className="space-y-8">
      {/* Diseño */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Diseño</h3>
        <div className="grid grid-cols-6 gap-4">
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
              id="measureInput"
              type="text"
              placeholder="Medida * (Ej: 20x20 o 20)"
              value={measureInput}
              onChange={(e) => {
                const value = e.target.value;
                setMeasureInput(value);
                
                // Parsear el valor: puede ser "20x20" o solo "20"
                const match = value.match(/^(\d+)(?:[xX×](\d+))?$/);
                if (match) {
                  const width = parseInt(match[1]);
                  const height = match[2] ? parseInt(match[2]) : width; // Si no hay altura, usar el mismo valor
                  
                  orderForm.setValue('order.requestedWidthMm', width);
                  orderForm.setValue('order.requestedHeightMm', height);
                } else if (value === '') {
                  // Si está vacío, limpiar los valores
                  orderForm.setValue('order.requestedWidthMm', 0);
                  orderForm.setValue('order.requestedHeightMm', 0);
                }
              }}
              className={orderForm.formState.errors.order?.requestedWidthMm ? 'border-red-500' : ''}
            />
            {orderForm.formState.errors.order?.requestedWidthMm && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order.requestedWidthMm.message}</p>
            )}
            {measureInput && !measureInput.match(/^\d+([xX×]\d+)?$/) && (
              <p className="text-xs text-yellow-500 mt-1">Formato: 20x20 o 20</p>
            )}
          </div>
          <div className="col-span-2">
            <Select 
              value={orderForm.watch('order.stampType') || 'CLASICO'}
              onValueChange={(value) => orderForm.setValue('order.stampType', value as StampType)}
            >
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
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Valores</h3>
        <div className="grid grid-cols-6 gap-4">
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
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Transportista y Estado</h3>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-3">
            <Select onValueChange={(value) => {
              if (value === 'OTRO') {
                orderForm.setValue('shipping.carrier', 'OTRO');
                orderForm.setValue('shipping.service', undefined);
              } else {
                const [carrier, service] = value.split('_') as [ShippingCarrier, ShippingServiceDest];
                orderForm.setValue('shipping.carrier', carrier);
                orderForm.setValue('shipping.service', service);
              }
            }} value={(() => {
              const carrier = orderForm.watch('shipping.carrier');
              const service = orderForm.watch('shipping.service');
              if (carrier === 'OTRO') return 'OTRO';
              if (carrier && service) return `${carrier}_${service}` as ShippingOption;
              return undefined;
            })()}>
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
            <Select 
              value={orderForm.watch('states.fabrication') || 'SIN_HACER'}
              onValueChange={(value) => orderForm.setValue('states.fabrication', value as FabricationState)}
            >
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
          <div className="col-span-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="isPriority" 
                  checked={orderForm.watch('states.isPriority')}
                  onCheckedChange={(checked) => orderForm.setValue('states.isPriority', !!checked)}
                />
                <Label htmlFor="isPriority" className="text-sm font-medium">
                  🔥 Pedido Prioritario
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline" className="text-sm font-medium">
                  📅 Fecha Límite
                </Label>
                <DatePicker
                  date={orderForm.watch('states.deadline')}
                  onDateChange={(date) => orderForm.setValue('states.deadline', date)}
                  placeholder="Seleccionar fecha límite"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Archivos */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Archivos</h3>
        <div className="grid grid-cols-6 gap-4">
          {(['base', 'vector'] as const).map((type) => (
            <div key={type} className="col-span-3 space-y-2">
              <Label className="capitalize">
                {type === 'base' ? 'Archivo Base' : 'Archivo Vector'}
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
      <div className="flex justify-between pt-6 border-t">
        <Button type="button" variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={handleAddDesign}>
            Agregar Diseño
          </Button>
          {onCreateOrder && (
            <Button 
              type="button" 
              onClick={() => {
                // Validar y agregar el diseño actual, luego crear el pedido
                orderForm.handleSubmit((data) => {
                  const finalData = {
                    ...data,
                    files,
                    step: 2,
                  };
                  onCreateOrder(finalData);
                })();
              }} 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creando...' : `Crear Pedido${designsCount > 0 ? ` (${designsCount + 1} diseño${designsCount > 0 ? 's' : ''})` : ''}`}
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  // Paso 3: Agregar Diseño (igual al paso 2 pero para diseños adicionales)
  if (currentStep === 3) {
    return (
      <form onSubmit={orderForm.handleSubmit(handleOrderSubmit)} className="space-y-8">
        <div className="space-y-6">
          <h3 className="text-lg font-medium">Agregar Diseño</h3>
          
          {/* Diseño */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Diseño</h3>
            <div className="grid grid-cols-6 gap-4">
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
                  id="measureInput-step3"
                  type="text"
                  placeholder="Medida * (Ej: 20x20 o 20)"
                  value={measureInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMeasureInput(value);
                    
                    // Parsear el valor: puede ser "20x20" o solo "20"
                    const match = value.match(/^(\d+)(?:[xX×](\d+))?$/);
                    if (match) {
                      const width = parseInt(match[1]);
                      const height = match[2] ? parseInt(match[2]) : width; // Si no hay altura, usar el mismo valor
                      
                      orderForm.setValue('order.requestedWidthMm', width);
                      orderForm.setValue('order.requestedHeightMm', height);
                    } else if (value === '') {
                      // Si está vacío, limpiar los valores
                      orderForm.setValue('order.requestedWidthMm', 0);
                      orderForm.setValue('order.requestedHeightMm', 0);
                    }
                  }}
                  className={orderForm.formState.errors.order?.requestedWidthMm ? 'border-red-500' : ''}
                />
                {orderForm.formState.errors.order?.requestedWidthMm && (
                  <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order?.requestedWidthMm?.message}</p>
                )}
                {measureInput && !measureInput.match(/^\d+([xX×]\d+)?$/) && (
                  <p className="text-xs text-yellow-500 mt-1">Formato: 20x20 o 20</p>
                )}
              </div>
              <div className="col-span-2">
                <Select 
                  value={orderForm.watch('order.stampType') || 'CLASICO'}
                  onValueChange={(value) => orderForm.setValue('order.stampType', value as StampType)}
                >
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
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Valores</h3>
            <div className="grid grid-cols-6 gap-4">
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
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Transportista y Estado</h3>
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3">
                <Select onValueChange={(value) => {
                  if (value === 'OTRO') {
                    orderForm.setValue('shipping.carrier', 'OTRO');
                    orderForm.setValue('shipping.service', undefined);
                  } else {
                    const [carrier, service] = value.split('_') as [ShippingCarrier, ShippingServiceDest];
                    orderForm.setValue('shipping.carrier', carrier);
                    orderForm.setValue('shipping.service', service);
                  }
                }} value={(() => {
                  const carrier = orderForm.watch('shipping.carrier');
                  const service = orderForm.watch('shipping.service');
                  if (carrier === 'OTRO') return 'OTRO';
                  if (carrier && service) return `${carrier}_${service}` as ShippingOption;
                  return undefined;
                })()}>
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
                <Select 
                  value={orderForm.watch('states.fabrication') || 'SIN_HACER'}
                  onValueChange={(value) => orderForm.setValue('states.fabrication', value as FabricationState)}
                >
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
              <div className="col-span-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="isPriority-step3" 
                      checked={orderForm.watch('states.isPriority')}
                      onCheckedChange={(checked) => orderForm.setValue('states.isPriority', !!checked)}
                    />
                    <Label htmlFor="isPriority-step3" className="text-sm font-medium">
                      🔥 Pedido Prioritario
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline-step3" className="text-sm font-medium">
                      📅 Fecha Límite
                    </Label>
                    <DatePicker
                      date={orderForm.watch('states.deadline')}
                      onDateChange={(date) => orderForm.setValue('states.deadline', date)}
                      placeholder="Seleccionar fecha límite"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Archivos */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Archivos</h3>
            <div className="grid grid-cols-6 gap-4">
              {(['base', 'vector'] as const).map((type) => (
                <div key={type} className="col-span-3 space-y-2">
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
        <div className="flex justify-between pt-6 border-t">
          <Button type="button" variant="outline" onClick={onBack}>
            Atrás
          </Button>
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => {
                // Validar y agregar diseño actual
                orderForm.handleSubmit((data) => {
                  const finalData = {
                    ...data,
                    files,
                  };
                  onStepSubmit(finalData, 3);
                  // Limpiar el formulario para el siguiente diseño
                  orderForm.reset({
                    order: {
                      stampType: 'CLASICO',
                    },
                    values: {
                      totalValue: 0,
                      depositValue: 10000,
                    },
                    shipping: {
                      carrier: 'ANDREANI',
                      service: 'DOMICILIO',
                    },
                    states: {
                      fabrication: 'SIN_HACER',
                      isPriority: false,
                      deadline: undefined,
                    },
                  });
                  setFiles({});
                  setMeasureInput('');
                })();
              }}
            >
              Agregar Otro Diseño
            </Button>
            {onCreateOrder && (
              <Button 
                type="button" 
                onClick={() => {
                  // Validar y agregar diseño actual antes de crear
                  orderForm.handleSubmit((data) => {
                    const finalData = {
                      ...data,
                      files,
                      step: 3,
                    };
                    onCreateOrder?.(finalData);
                  })();
                }} 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creando...' : `Finalizar Pedido${designsCount > 0 ? ` (${designsCount + 1} diseño${designsCount > 0 ? 's' : ''})` : ''}`}
              </Button>
            )}
          </div>
        </div>
      </form>
    );
  }
}
