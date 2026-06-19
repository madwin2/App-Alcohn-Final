import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { NewOrderFormData, FabricationState, ShippingCarrier, ShippingServiceDest, ShippingOption, StampType, ItemType, SoldadorPower, AbecedarioCase } from '@/lib/types/index';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { findCustomer } from '@/lib/supabase/services/orders.service';
import { normalizePhoneDigitsCliente } from '@/lib/utils/phoneNormalization';
import { fetchPreciosResolverInputForCotizacion } from '@/lib/supabase/services/preciosPro.service';
import type { PreciosResolverInput } from '@/lib/precios/resolverPrecioSello';
import { cotizarSelloRectangularCm, mmPedidoAcm, parseMedidaMmAString } from '@/lib/precios/cotizacionMedida';
import { NewOrderDesignTabs } from './NewOrderDesignTabs';
import { measureInputFromDesign, type SavedDesignData } from './newOrderDesignUtils';
import type { SaveDesignOptions } from './NewOrderDialog';

// Schema para el paso 1 (Información del cliente)
const customerSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1, 'El nombre es requerido'),
    lastName: z.string().min(1, 'El apellido es requerido'),
    phoneE164: z.string().min(1, 'El teléfono es requerido'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MAIL', 'WEB', 'OTRO']),
  }),
  /** No enviar webhook de pedido registrado (alta tardía manual). */
  skipConfirmationWebhook: z.boolean().optional(),
});

// Schema para el paso 2 (Información del pedido)
const orderSchema = z.object({
  order: z.object({
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
  }),
  values: z.object({
    totalValue: z.number().min(0, 'El valor total debe ser mayor o igual a 0'),
    depositValue: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  }),
  shipping: z.object({
    carrier: z.enum(['ANDREANI', 'CORREO_ARGENTINO', 'VIA_CARGO', 'OTRO']).optional(),
    service: z.enum(['DOMICILIO', 'SUCURSAL']).optional(),
  }),
  states: z.object({
    fabrication: z.enum(['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR', 'PROGRAMADO']),
    isPriority: z.boolean(),
    deadline: z.date().optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.order.itemType === 'SELLO' && !data.order.designName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El nombre del diseño es requerido',
      path: ['order', 'designName'],
    });
  }
});

type CustomerFormData = z.infer<typeof customerSchema>;
type OrderFormData = z.infer<typeof orderSchema>;

interface NewOrderStepFormProps {
  currentStep: number;
  onStepSubmit: (data: any, step: number) => void;
  onDesignSave: (data: SavedDesignData, options?: SaveDesignOptions) => void;
  onCancel: () => void;
  onBack: () => void;
  onCreateOrder?: (currentDesign?: SavedDesignData, editIndex?: number) => void;
  initialData: Partial<NewOrderFormData>;
  savedDesigns?: SavedDesignData[];
  isSubmitting?: boolean;
}

const emptyDesignFormValues = {
  order: {
    itemType: 'SELLO' as ItemType,
    stampType: 'CLASICO' as StampType,
    requestedWidthMm: 1,
    requestedHeightMm: 1,
  },
  values: { totalValue: 0, depositValue: 20000 },
  shipping: { carrier: undefined, service: undefined },
  states: { fabrication: 'SIN_HACER' as FabricationState, isPriority: false, deadline: undefined },
};

const channelOptions = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'MAIL', label: 'Email' },
  { value: 'WEB', label: 'Web' },
  { value: 'OTRO', label: 'Otro' },
];

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

const soldadorPowerOptions: { value: SoldadorPower; label: string }[] = [
  { value: '100W', label: '100W' },
  { value: '200W', label: '200W' },
];

const abecedarioCaseOptions: { value: AbecedarioCase; label: string }[] = [
  { value: 'MAYUSCULA', label: 'Mayúscula' },
  { value: 'MINUSCULA', label: 'Minúscula' },
  { value: 'AMBAS', label: 'Ambas' },
];

const carrierOptions = [
  { value: 'NONE', label: '—' },
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
  { value: 'ERROR_ETIQUETA', label: 'Error de Etiqueta' },
  { value: 'ETIQUETA_LISTA', label: 'Etiqueta Lista' },
  { value: 'DESPACHADO', label: 'Despachado' },
  { value: 'SEGUIMIENTO_ENVIADO', label: 'Seguimiento Enviado' },
];

export function NewOrderStepForm({
  currentStep,
  onStepSubmit,
  onDesignSave,
  onCancel,
  onBack,
  onCreateOrder,
  initialData,
  savedDesigns = [],
  isSubmitting = false,
}: NewOrderStepFormProps) {
  const [files, setFiles] = useState<{
    base?: File;
    vector?: File;
    photo?: File;
  }>({});
  const [activeSlot, setActiveSlot] = useState<number | 'new'>('new');
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const phoneTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emailTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoFilledRef = useRef(false);
  const [measureInput, setMeasureInput] = useState<string>('');
  const [preciosCotizacion, setPreciosCotizacion] = useState<PreciosResolverInput | null>(null);
  const [preciosFetchHecho, setPreciosFetchHecho] = useState(false);

  // Formulario para el paso 1 (Cliente)
  const customerForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer: {
        channel: 'WHATSAPP',
        ...initialData.customer,
      },
      skipConfirmationWebhook: initialData.skipConfirmationWebhook ?? false,
    },
  });

  const prevStepRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = currentStep;
    if (prev === 2 && currentStep === 1 && initialData.customer) {
      customerForm.reset({
        customer: {
          channel: initialData.customer.channel ?? 'WHATSAPP',
          firstName: initialData.customer.firstName ?? '',
          lastName: initialData.customer.lastName ?? '',
          phoneE164: initialData.customer.phoneE164 ?? '',
          email: initialData.customer.email ?? '',
        },
        skipConfirmationWebhook: initialData.skipConfirmationWebhook ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset al volver del paso 2
  }, [currentStep, initialData.customer, initialData.skipConfirmationWebhook]);

  // Observar cambios en teléfono o email para autocompletar datos del cliente
  const watchedPhone = customerForm.watch('customer.phoneE164');
  const watchedEmail = customerForm.watch('customer.email');

  const applyCustomerAutocomplete = useCallback(
    (customer: Awaited<ReturnType<typeof findCustomer>>) => {
      if (!customer) return false;

      const currentFirstName = customerForm.getValues('customer.firstName');
      const currentLastName = customerForm.getValues('customer.lastName');
      const currentEmail = customerForm.getValues('customer.email');
      const currentPhone = customerForm.getValues('customer.phoneE164');

      let filled = false;
      if (!currentFirstName && customer.firstName) {
        customerForm.setValue('customer.firstName', customer.firstName);
        filled = true;
      }
      if (!currentLastName && customer.lastName) {
        customerForm.setValue('customer.lastName', customer.lastName);
        filled = true;
      }
      if (!currentEmail && customer.email) {
        customerForm.setValue('customer.email', customer.email);
        filled = true;
      }
      if (!currentPhone && customer.phoneE164) {
        const phone = normalizePhoneDigitsCliente(customer.phoneE164) || customer.phoneE164;
        customerForm.setValue('customer.phoneE164', phone);
        filled = true;
      }
      if (filled) hasAutoFilledRef.current = true;
      return filled;
    },
    [customerForm],
  );

  useEffect(() => {
    if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);

    if (!watchedPhone || watchedPhone.length < 8) return;

    phoneTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLoadingCustomer(true);
        const customer = await findCustomer(watchedPhone, watchedEmail);
        applyCustomerAutocomplete(customer);
      } catch (error) {
        console.error('Error buscando cliente:', error);
      } finally {
        setIsLoadingCustomer(false);
      }
    }, 500);

    return () => {
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
    };
  }, [watchedPhone, watchedEmail, applyCustomerAutocomplete]);

  useEffect(() => {
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);

    const email = (watchedEmail || '').trim();
    if (!email || !email.includes('@')) return;

    emailTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLoadingCustomer(true);
        const customer = await findCustomer(watchedPhone || '', email);
        applyCustomerAutocomplete(customer);
      } catch (error) {
        console.error('Error buscando cliente por email:', error);
      } finally {
        setIsLoadingCustomer(false);
      }
    }, 500);

    return () => {
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    };
  }, [watchedEmail, watchedPhone, customerForm, applyCustomerAutocomplete]);

  // Formulario para el paso 2 (Pedido)
  const orderForm = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order: {
        itemType: 'SELLO',
        stampType: 'CLASICO',
        requestedWidthMm: 1,
        requestedHeightMm: 1,
        ...initialData.order,
      },
      values: {
        totalValue: 0,
        depositValue: 20000,
        ...initialData.values,
      },
      shipping: {
        carrier: undefined,
        service: undefined,
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
  const selectedItemType = orderForm.watch('order.itemType');
  const totalValue = watchedValues[0] || 0;
  const depositValue = watchedValues[1] || 0;
  const restante = Math.max(0, totalValue - depositValue);

  useEffect(() => {
    if (currentStep !== 2 && currentStep !== 3) return;
    setPreciosFetchHecho(false);
    void fetchPreciosResolverInputForCotizacion()
      .then((p) => {
        setPreciosCotizacion(p);
        setPreciosFetchHecho(true);
      })
      .catch(() => {
        setPreciosCotizacion(null);
        setPreciosFetchHecho(true);
      });
  }, [currentStep]);

  const aplicarMedidaDesdeTexto = useCallback(
    (value: string) => {
      setMeasureInput(value);
      const parsed = parseMedidaMmAString(value);
      if (parsed) {
        orderForm.setValue('order.requestedWidthMm', parsed.anchoMm, { shouldDirty: true, shouldValidate: true });
        orderForm.setValue('order.requestedHeightMm', parsed.altoMm, { shouldDirty: true, shouldValidate: true });
      } else if (value.trim() === '') {
        orderForm.setValue('order.requestedWidthMm', 1, { shouldDirty: true });
        orderForm.setValue('order.requestedHeightMm', 1, { shouldDirty: true });
      }
    },
    [orderForm],
  );

  const wMm = useWatch({ control: orderForm.control, name: 'order.requestedWidthMm' });
  const hMm = useWatch({ control: orderForm.control, name: 'order.requestedHeightMm' });

  useEffect(() => {
    if (selectedItemType !== 'SELLO') return;
    if (currentStep !== 2 && currentStep !== 3) return;
    if (!preciosCotizacion) return;
    const w = Number(wMm) || 0;
    const h = Number(hMm) || 0;
    if (w < 1 || h < 1) return;
    /** 1×1 mm = placeholder hasta que cargue medida (evita cotizar antes de escribir). */
    if (w === 1 && h === 1) return;
    const { anchoCm, altoCm } = mmPedidoAcm(w, h);
    const c = cotizarSelloRectangularCm(anchoCm, altoCm, preciosCotizacion);
    if (!c) return;
    orderForm.setValue('values.totalValue', c.precioTransferencia, { shouldDirty: true, shouldValidate: true });
  }, [preciosCotizacion, selectedItemType, currentStep, wMm, hMm, orderForm]);

  useEffect(() => {
    if (selectedItemType === 'SOLDADOR') {
      orderForm.setValue('values.totalValue', 75000);
    } else if (selectedItemType === 'MANGO_GOLPE') {
      orderForm.setValue('values.totalValue', 25000);
    } else if (selectedItemType === 'BASE_REMACHADORA') {
      orderForm.setValue('values.totalValue', 40000);
    }
    if (selectedItemType !== 'SELLO') {
      orderForm.setValue('order.requestedWidthMm', 1);
      orderForm.setValue('order.requestedHeightMm', 1);
      orderForm.setValue('order.stampType', 'CLASICO');
    }
  }, [selectedItemType, orderForm]);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const resetDesignForm = useCallback(() => {
    orderForm.reset(emptyDesignFormValues);
    setFiles({});
    setMeasureInput('');
    setActiveSlot('new');
  }, [orderForm]);

  const loadDesignIntoForm = useCallback(
    (design: SavedDesignData) => {
      orderForm.reset({
        order: { ...emptyDesignFormValues.order, ...design.order },
        values: design.values,
        shipping: design.shipping,
        states: design.states,
      });
      setFiles(design.files ?? {});
      setMeasureInput(measureInputFromDesign(design.order));
    },
    [orderForm],
  );

  const captureCurrentDesign = useCallback((): SavedDesignData => {
    const values = orderForm.getValues();
    const itemType = values.order.itemType;
    return {
      order: {
        ...values.order,
        designName: itemType === 'SELLO' ? (values.order.designName || '') : '',
      },
      values: values.values,
      shipping: values.shipping,
      states: values.states,
      files: { ...files },
    };
  }, [orderForm, files]);

  const buildDesignPayload = (data: OrderFormData): SavedDesignData => ({
    ...data,
    order: {
      ...data.order,
      designName: selectedItemType === 'SELLO' ? (data.order.designName || '') : '',
    },
    files,
  });

  const persistActiveSlotDraft = useCallback(() => {
    if (activeSlot === 'new') return;
    onDesignSave(captureCurrentDesign(), { index: activeSlot });
  }, [activeSlot, captureCurrentDesign, onDesignSave]);

  const handleSelectDesign = (index: number) => {
    if (activeSlot !== 'new' && activeSlot !== index) {
      persistActiveSlotDraft();
    }
    loadDesignIntoForm(savedDesigns[index]);
    setActiveSlot(index);
  };

  const handleSelectNewDesign = () => {
    if (activeSlot !== 'new') {
      persistActiveSlotDraft();
    }
    resetDesignForm();
  };

  const handleCustomerSubmit = (data: CustomerFormData) => {
    onStepSubmit(data, 1);
  };

  const handleOrderSubmit = (data: OrderFormData) => {
    onDesignSave(buildDesignPayload(data), {
      index: activeSlot === 'new' ? undefined : activeSlot,
      advanceToStep3: true,
    });
    resetDesignForm();
  };

  const handleSaveAndAddAnother = () => {
    orderForm.handleSubmit((data) => {
      onDesignSave(buildDesignPayload(data), {
        index: activeSlot === 'new' ? undefined : activeSlot,
        advanceToStep3: currentStep === 2,
      });
      resetDesignForm();
    })();
  };

  const handleCreateOrderClick = () => {
    orderForm.handleSubmit((data) => {
      onCreateOrder?.(buildDesignPayload(data), activeSlot === 'new' ? undefined : activeSlot);
    })();
  };

  const designsCountOnSubmit =
    activeSlot === 'new' ? savedDesigns.length + 1 : savedDesigns.length;

  const designTabs =
    savedDesigns.length > 0 ? (
      <NewOrderDesignTabs
        savedDesigns={savedDesigns}
        activeSlot={activeSlot}
        onSelectDesign={handleSelectDesign}
        onSelectNew={handleSelectNewDesign}
        className="pb-2"
      />
    ) : null;

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
            <div className="space-y-2 col-span-2">
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

        <div className="flex items-start gap-3 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3">
          <Checkbox
            id="skipConfirmationWebhook"
            checked={!!customerForm.watch('skipConfirmationWebhook')}
            onCheckedChange={(c) =>
              customerForm.setValue('skipConfirmationWebhook', c === true, { shouldDirty: true })
            }
          />
          <Label htmlFor="skipConfirmationWebhook" className="cursor-pointer text-sm font-normal leading-snug text-muted-foreground">
            No enviar aviso de confirmación al cliente (solo este pedido). Útil si cargás un alta manual tarde y no querés que se dispare el mensaje automático.
          </Label>
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
      {designTabs}
      {/* Diseño */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Diseño</h3>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-2">
            <Select
              value={orderForm.watch('order.itemType') || 'SELLO'}
              onValueChange={(value) => orderForm.setValue('order.itemType', value as ItemType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Ítem" />
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
          )}
          <div className="col-span-2">
            <Input
              id="measureInput"
              type="text"
              placeholder="Medida * en mm (ej: 40×40 o 35)"
              value={measureInput}
              onChange={(e) => aplicarMedidaDesdeTexto(e.target.value)}
              className={`${selectedItemType !== 'SELLO' ? 'opacity-60' : ''} ${orderForm.formState.errors.order?.requestedWidthMm ? 'border-red-500' : ''}`}
              disabled={selectedItemType !== 'SELLO'}
            />
            {orderForm.formState.errors.order?.requestedWidthMm && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.order.requestedWidthMm.message}</p>
            )}
            {measureInput && !parseMedidaMmAString(measureInput) && (
              <p className="text-xs text-yellow-500 mt-1">Formato: 40×40 o 35 (milímetros)</p>
            )}
            {preciosCotizacion &&
            selectedItemType === 'SELLO' &&
            Number(wMm) >= 1 &&
            Number(hMm) >= 1 &&
            !(Number(wMm) === 1 && Number(hMm) === 1) ? (
              <p className="text-[11px] text-muted-foreground">
                Valor sugerido por lista de precios (transferencia); podés editarlo si aplica descuento.
              </p>
            ) : null}
            {selectedItemType === 'SELLO' && preciosFetchHecho && !preciosCotizacion && (
              <p className="text-[11px] text-amber-500/90 mt-1">
                No se pudo cargar el catálogo de precios (Supabase / permisos). El total no se autocompleta; revisá la migración de lectura del equipo.
              </p>
            )}
          </div>
          <div className="col-span-2">
            {selectedItemType === 'SELLO' && (
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
            )}
            {selectedItemType === 'SOLDADOR' && (
              <Select
                value={orderForm.watch('order.soldadorPower') || '100W'}
                onValueChange={(value) => orderForm.setValue('order.soldadorPower', value as SoldadorPower)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Potencia" />
                </SelectTrigger>
                <SelectContent>
                  {soldadorPowerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedItemType === 'ABECEDARIO' && (
              <Input
                placeholder="Tipografía"
                value={orderForm.watch('order.abecedarioTipografia') || ''}
                onChange={(e) => orderForm.setValue('order.abecedarioTipografia', e.target.value)}
              />
            )}
          </div>
          {selectedItemType === 'ABECEDARIO' && (
            <>
              <div className="col-span-2">
                <Input
                  type="number"
                  placeholder="Altura de letra (mm)"
                  value={orderForm.watch('order.abecedarioAlturaMm') || ''}
                  onChange={(e) => orderForm.setValue('order.abecedarioAlturaMm', Number(e.target.value))}
                />
              </div>
              <div className="col-span-2">
                <Select
                  value={orderForm.watch('order.abecedarioCase') || 'MAYUSCULA'}
                  onValueChange={(value) => orderForm.setValue('order.abecedarioCase', value as AbecedarioCase)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mayús / Minús" />
                  </SelectTrigger>
                  <SelectContent>
                    {abecedarioCaseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Input
                  placeholder="Letras extras (opcional)"
                  value={orderForm.watch('order.abecedarioExtraLetters') || ''}
                  onChange={(e) => orderForm.setValue('order.abecedarioExtraLetters', e.target.value)}
                />
              </div>
            </>
          )}
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
              disabled={selectedItemType === 'SOLDADOR' || selectedItemType === 'MANGO_GOLPE' || selectedItemType === 'BASE_REMACHADORA'}
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
              if (value === 'NONE') {
                orderForm.setValue('shipping.carrier', undefined);
                orderForm.setValue('shipping.service', undefined);
              } else if (value === 'OTRO') {
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
              if (!carrier) return 'NONE';
              if (carrier === 'OTRO') return 'OTRO';
              if (carrier && service) return `${carrier}_${service}` as ShippingOption;
              return 'NONE';
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
          <Button type="button" variant="secondary" onClick={handleSaveAndAddAnother}>
            {currentStep === 3 && savedDesigns.length > 0 ? 'Agregar Otro Diseño' : 'Agregar Diseño'}
          </Button>
          {onCreateOrder && (
            <Button type="button" onClick={handleCreateOrderClick} disabled={isSubmitting}>
              {isSubmitting
                ? 'Creando...'
                : `${currentStep === 3 ? 'Finalizar' : 'Crear'} Pedido${
                    designsCountOnSubmit > 0
                      ? ` (${designsCountOnSubmit} diseño${designsCountOnSubmit > 1 ? 's' : ''})`
                      : ''
                  }`}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}