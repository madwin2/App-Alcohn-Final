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
import { NewOrderFormData, FabricationState, ShippingCarrier, ShippingServiceDest, StampType, ItemType, SoldadorPower, Order } from '@/lib/types/index';
import { OrderTypeBadge } from '@/components/pedidos/OrderTypeBadge';
import {
  CLIENTE_PRUEBAS_APELLIDO,
  CLIENTE_PRUEBAS_NOMBRE,
  type OrderType,
} from '@/lib/pedidos/tipoPedido';
import { AbecedarioFields } from '@/components/pedidos/abecedario/AbecedarioFields';
import {
  writeAbecedarioFields,
  type AbecedarioFormFields,
} from '@/lib/abecedario/abecedarioConfig';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Upload, X } from 'lucide-react';
import { findCustomer } from '@/lib/supabase/services/orders.service';
import { normalizePhoneDigitsCliente } from '@/lib/utils/phoneNormalization';
import { fetchPreciosResolverInputForCotizacion } from '@/lib/supabase/services/preciosPro.service';
import type { PreciosResolverInput } from '@/lib/precios/resolverPrecioSello';
import { cotizarSelloRectangularCm, mmPedidoAcm, parseMedidaMmAString } from '@/lib/precios/cotizacionMedida';
import {
  formatMontoInternacional,
  PAISES_INTERNACIONALES,
  type PaisInternacional,
} from '@/lib/internacional';
import { NewOrderDesignTabs } from './NewOrderDesignTabs';
import { measureInputFromDesign, type SavedDesignData } from './newOrderDesignUtils';
import type { SaveDesignOptions } from './NewOrderDialog';

const internationalCountryIso2Schema = z.enum(['MX', 'CO', 'PE', 'CL']);

// Schema para el paso 1 (Información del cliente)
const customerSchema = z
  .object({
    /** Tipo de pedido (Venta | Regalo | Prueba interna). */
    orderType: z.enum(['VENTA', 'REGALO', 'PRUEBA']),
    /** Motivo de la prueba (obligatorio si orderType = PRUEBA). */
    testReason: z.string().optional(),
    /** Regalo: id del pedido abierto al que se suma (null = pedido de regalo aparte). */
    attachGiftToOrderId: z.string().nullable().optional(),
    customer: z.object({
      // En Prueba el cliente es el interno fijo: la obligatoriedad se valida en el superRefine.
      firstName: z.string(),
      lastName: z.string(),
      phoneE164: z.string(),
      email: z.string().email('Email inválido').optional().or(z.literal('')),
      channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'MAIL', 'WEB', 'OTRO']),
    }),
    /** No enviar webhook de pedido registrado (alta tardía manual). */
    skipConfirmationWebhook: z.boolean().optional(),
    isInternational: z.boolean().optional(),
    internationalCountryIso2: internationalCountryIso2Schema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === 'PRUEBA') {
      if (!data.testReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El motivo de la prueba es requerido',
          path: ['testReason'],
        });
      }
      return;
    }
    if (!data.customer.firstName.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El nombre es requerido', path: ['customer', 'firstName'] });
    }
    if (!data.customer.lastName.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El apellido es requerido', path: ['customer', 'lastName'] });
    }
    if (!data.customer.phoneE164.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El teléfono es requerido', path: ['customer', 'phoneE164'] });
    }
    if (data.isInternational && !data.internationalCountryIso2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleccioná el país',
        path: ['internationalCountryIso2'],
      });
    }
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
    abecedarioMayusculas: z.number().optional(),
    abecedarioMinusculas: z.number().optional(),
    abecedarioExtraLetterCounts: z.record(z.string(), z.number()).optional(),
    abecedarioSpecialCharsCount: z.number().optional(),
    abecedarioSpecialCharsDescription: z.string().optional(),
    abecedarioCase: z.enum(['MAYUSCULA', 'MINUSCULA', 'AMBAS']).optional(),
    abecedarioExtraLetters: z.string().optional(),
    notes: z.string().optional(),
    /** Casilla "Regalo (sin cargo)" por diseño (solo en pedidos de tipo Venta). */
    isGift: z.boolean().optional(),
  }),
  values: z.object({
    totalValue: z.number().min(0, 'El valor total debe ser mayor o igual a 0'),
    depositValue: z.number().min(0, 'La seña debe ser mayor o igual a 0'),
  }),
  shipping: z.object({
    carrier: z.enum(['ANDREANI', 'CORREO_ARGENTINO', 'VIA_CARGO', 'OTRO', 'RETIRO_EN_PERSONA', 'DHL']).optional(),
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
  /**
   * Pedidos cargados (store). Se usan para ofrecer "Sumar al pedido abierto" cuando
   * el tipo es Regalo y el cliente tiene pedidos sin despachar.
   */
  orders?: Order[];
}

/** Pedido Venta del cliente que todavía no salió (algún ítem sin Despachado / Seguimiento Enviado). */
const isOpenSaleOrder = (o: Order) =>
  (o.orderType ?? 'VENTA') === 'VENTA' &&
  o.items.length > 0 &&
  o.items.some((i) => i.shippingState !== 'DESPACHADO' && i.shippingState !== 'SEGUIMIENTO_ENVIADO');

const orderTypeOptions: { value: OrderType; label: string; hint: string }[] = [
  { value: 'VENTA', label: 'Venta', hint: 'Pedido normal con cobro.' },
  { value: 'REGALO', label: 'Regalo', hint: 'Sin cargo para el cliente; el envío lo paga Alcohn.' },
  { value: 'PRUEBA', label: 'Prueba interna', hint: 'Se fabrica pero no es venta ni se envía.' },
];

const DEFAULT_DEPOSIT_ARS = 20000;

const buildEmptyDesignFormValues = (pais: PaisInternacional | null, orderType: OrderType = 'VENTA') => ({
  order: {
    itemType: 'SELLO' as ItemType,
    stampType: 'CLASICO' as StampType,
    requestedWidthMm: 1,
    requestedHeightMm: 1,
  },
  // Regalo/Prueba: sin cargo => valor y seña en 0.
  values: { totalValue: 0, depositValue: pais || orderType !== 'VENTA' ? 0 : DEFAULT_DEPOSIT_ARS },
  shipping: {
    // Prueba: nunca se envía => sin transportista.
    carrier: (orderType === 'PRUEBA' ? undefined : pais ? 'DHL' : 'ANDREANI') as ShippingCarrier,
    service: (orderType === 'PRUEBA' ? undefined : 'DOMICILIO') as ShippingServiceDest,
  },
  states: { fabrication: 'SIN_HACER' as FabricationState, isPriority: false, deadline: undefined },
});

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

const carrierOptions: {
  value: string;
  label: string;
  carrier?: ShippingCarrier;
  service?: ShippingServiceDest;
}[] = [
  { value: 'NONE', label: '—' },
  { value: 'ANDREANI_DOMICILIO', label: 'Andreani - Domicilio', carrier: 'ANDREANI', service: 'DOMICILIO' },
  { value: 'ANDREANI_SUCURSAL', label: 'Andreani - Sucursal', carrier: 'ANDREANI', service: 'SUCURSAL' },
  { value: 'CORREO_ARGENTINO_DOMICILIO', label: 'Correo Argentino - Domicilio', carrier: 'CORREO_ARGENTINO', service: 'DOMICILIO' },
  { value: 'CORREO_ARGENTINO_SUCURSAL', label: 'Correo Argentino - Sucursal', carrier: 'CORREO_ARGENTINO', service: 'SUCURSAL' },
  { value: 'VIA_CARGO_DOMICILIO', label: 'Vía Cargo - Domicilio', carrier: 'VIA_CARGO', service: 'DOMICILIO' },
  { value: 'VIA_CARGO_SUCURSAL', label: 'Vía Cargo - Sucursal', carrier: 'VIA_CARGO', service: 'SUCURSAL' },
  { value: 'RETIRO_EN_PERSONA', label: 'Retiro en Persona', carrier: 'RETIRO_EN_PERSONA' },
  { value: 'DHL', label: 'DHL Internacional', carrier: 'DHL', service: 'DOMICILIO' },
  { value: 'OTRO', label: 'Otro', carrier: 'OTRO' },
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
  orders = [],
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

  const paisInternacional = useMemo(() => {
    const iso = initialData.internationalCountryIso2;
    return iso ? PAISES_INTERNACIONALES[iso] : null;
  }, [initialData.internationalCountryIso2]);

  const emptyDesignFormValues = useMemo(
    () => buildEmptyDesignFormValues(paisInternacional, initialData.orderType ?? 'VENTA'),
    [paisInternacional, initialData.orderType],
  );

  const arsAMonedaPedido = useCallback(
    (ars: number) =>
      paisInternacional ? Math.round(ars / paisInternacional.arsPorUnidad) : ars,
    [paisInternacional],
  );

  // Formulario para el paso 1 (Cliente)
  const customerForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      orderType: initialData.orderType ?? 'VENTA',
      testReason: initialData.testReason ?? '',
      attachGiftToOrderId: initialData.attachGiftToOrderId ?? null,
      customer: {
        channel: 'WHATSAPP',
        ...initialData.customer,
      },
      skipConfirmationWebhook: initialData.skipConfirmationWebhook ?? false,
      isInternational: Boolean(initialData.internationalCountryIso2),
      internationalCountryIso2: initialData.internationalCountryIso2 ?? null,
    },
  });

  const isInternational = customerForm.watch('isInternational');
  const formOrderType = customerForm.watch('orderType') ?? 'VENTA';
  const isPrueba = formOrderType === 'PRUEBA';
  const isRegaloType = formOrderType === 'REGALO';
  /** Tipo ya confirmado en el paso 1 (se usa en los pasos 2 y 3). */
  const orderType: OrderType = initialData.orderType ?? 'VENTA';
  const isPruebaOrder = orderType === 'PRUEBA';
  const isRegaloOrder = orderType === 'REGALO';
  const isSinCargoOrder = isPruebaOrder || isRegaloOrder;
  const attachGiftToOrderId = initialData.attachGiftToOrderId ?? null;
  const attachedOrder = useMemo(
    () => (attachGiftToOrderId ? orders.find((o) => o.id === attachGiftToOrderId) ?? null : null),
    [orders, attachGiftToOrderId],
  );

  const handleOrderTypeChange = (next: OrderType) => {
    customerForm.setValue('orderType', next, { shouldDirty: true });
    if (next !== 'PRUEBA') {
      // Al salir de Prueba, no arrastrar los datos del cliente interno al formulario.
      const { firstName, lastName } = customerForm.getValues('customer');
      if (firstName === CLIENTE_PRUEBAS_NOMBRE && lastName === CLIENTE_PRUEBAS_APELLIDO) {
        customerForm.setValue('customer.firstName', '');
        customerForm.setValue('customer.lastName', '');
        customerForm.setValue('customer.phoneE164', '');
        customerForm.setValue('customer.email', '');
      }
    }
    if (next !== 'REGALO') {
      customerForm.setValue('attachGiftToOrderId', null, { shouldDirty: true });
    }
    if (next !== 'VENTA') {
      // Internacional queda fuera de alcance para Regalo/Prueba.
      customerForm.setValue('isInternational', false, { shouldDirty: true });
      customerForm.setValue('internationalCountryIso2', null, { shouldDirty: true });
    }
    customerForm.clearErrors();
  };

  const prevStepRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = currentStep;
    if (prev === 2 && currentStep === 1 && initialData.customer) {
      customerForm.reset({
        orderType: initialData.orderType ?? 'VENTA',
        testReason: initialData.testReason ?? '',
        attachGiftToOrderId: initialData.attachGiftToOrderId ?? null,
        customer: {
          channel: initialData.customer.channel ?? 'WHATSAPP',
          firstName: initialData.customer.firstName ?? '',
          lastName: initialData.customer.lastName ?? '',
          phoneE164: initialData.customer.phoneE164 ?? '',
          email: initialData.customer.email ?? '',
        },
        skipConfirmationWebhook: initialData.skipConfirmationWebhook ?? false,
        isInternational: Boolean(initialData.internationalCountryIso2),
        internationalCountryIso2: initialData.internationalCountryIso2 ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset al volver del paso 2
  }, [
    currentStep,
    initialData.customer,
    initialData.skipConfirmationWebhook,
    initialData.internationalCountryIso2,
    initialData.orderType,
    initialData.testReason,
    initialData.attachGiftToOrderId,
  ]);

  // Observar cambios en teléfono o email para autocompletar datos del cliente
  const watchedPhone = customerForm.watch('customer.phoneE164');
  const watchedEmail = customerForm.watch('customer.email');
  const watchedAttachId = customerForm.watch('attachGiftToOrderId');

  /** Regalo: pedidos Venta abiertos (sin despachar) del cliente cargado en el formulario. */
  const openOrdersForGift = useMemo(() => {
    if (!isRegaloType) return [] as Order[];
    const phone = normalizePhoneDigitsCliente(watchedPhone || '');
    const email = (watchedEmail || '').trim().toLowerCase();
    if (!phone && !email) return [] as Order[];
    return orders.filter((o) => {
      if (!isOpenSaleOrder(o)) return false;
      const oPhone = normalizePhoneDigitsCliente(o.customer.phoneE164 || '');
      const oEmail = (o.customer.email || '').trim().toLowerCase();
      return (phone && oPhone && phone === oPhone) || (email && oEmail && email === oEmail);
    });
  }, [isRegaloType, orders, watchedPhone, watchedEmail]);

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

    if (isPrueba) return;
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
  }, [watchedPhone, watchedEmail, applyCustomerAutocomplete, isPrueba]);

  useEffect(() => {
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);

    if (isPrueba) return;
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
  }, [watchedEmail, watchedPhone, customerForm, applyCustomerAutocomplete, isPrueba]);

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
        depositValue: paisInternacional ? 0 : 20000,
        ...initialData.values,
      },
      shipping: {
        carrier: paisInternacional ? 'DHL' : 'ANDREANI',
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

  // Al entrar al paso 2 con pedido internacional, forzar DHL y seña 0 si aún están los defaults nacionales.
  const intlDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (currentStep !== 2 || !paisInternacional) return;
    if (intlDefaultsAppliedRef.current) return;
    intlDefaultsAppliedRef.current = true;
    const carrier = orderForm.getValues('shipping.carrier');
    const deposit = orderForm.getValues('values.depositValue');
    if (carrier === 'ANDREANI') {
      orderForm.setValue('shipping.carrier', 'DHL', { shouldDirty: true });
      orderForm.setValue('shipping.service', 'DOMICILIO', { shouldDirty: true });
    }
    if (deposit === DEFAULT_DEPOSIT_ARS) {
      orderForm.setValue('values.depositValue', 0, { shouldDirty: true });
    }
  }, [currentStep, paisInternacional, orderForm]);

  const watchedValues = orderForm.watch(['values.totalValue', 'values.depositValue']);
  const selectedItemType = orderForm.watch('order.itemType');
  /** Casilla "Regalo (sin cargo)" del diseño (solo aplica en pedidos Venta). */
  const designIsGift = orderForm.watch('order.isGift') === true && orderType === 'VENTA';
  /** Valor y seña bloqueados en 0: pedido Regalo/Prueba o diseño marcado como regalo. */
  const valoresBloqueados = isSinCargoOrder || designIsGift;

  // Regalo/Prueba (o diseño regalo): forzar valor y seña en 0 y quitar el envío en Prueba.
  useEffect(() => {
    if (currentStep < 2) return;
    if (valoresBloqueados) {
      if (orderForm.getValues('values.totalValue') !== 0) {
        orderForm.setValue('values.totalValue', 0, { shouldDirty: true, shouldValidate: true });
      }
      if (orderForm.getValues('values.depositValue') !== 0) {
        orderForm.setValue('values.depositValue', 0, { shouldDirty: true, shouldValidate: true });
      }
    }
    if (isPruebaOrder && orderForm.getValues('shipping.carrier')) {
      orderForm.setValue('shipping.carrier', undefined, { shouldDirty: true });
      orderForm.setValue('shipping.service', undefined, { shouldDirty: true });
    }
    if (isSinCargoOrder && orderForm.getValues('order.isGift')) {
      orderForm.setValue('order.isGift', false, { shouldDirty: true });
    }
  }, [currentStep, valoresBloqueados, isPruebaOrder, isSinCargoOrder, orderForm]);

  // Si el usuario vuelve al paso 1 y cambia el tipo, restaurar los defaults de valores/envío del formulario actual.
  const prevOrderTypeRef = useRef<OrderType>(orderType);
  useEffect(() => {
    const prev = prevOrderTypeRef.current;
    prevOrderTypeRef.current = orderType;
    if (prev === orderType) return;
    if (orderType === 'VENTA' && !paisInternacional && orderForm.getValues('values.depositValue') === 0) {
      orderForm.setValue('values.depositValue', DEFAULT_DEPOSIT_ARS, { shouldDirty: true });
    }
    if (prev === 'PRUEBA' && orderType !== 'PRUEBA' && !orderForm.getValues('shipping.carrier')) {
      orderForm.setValue('shipping.carrier', paisInternacional ? 'DHL' : 'ANDREANI', { shouldDirty: true });
      orderForm.setValue('shipping.service', 'DOMICILIO', { shouldDirty: true });
    }
  }, [orderType, paisInternacional, orderForm]);

  /** Al tildar/destildar "Regalo (sin cargo)" en una Venta: restaura la seña por defecto al destildar. */
  const handleDesignGiftToggle = (checked: boolean) => {
    orderForm.setValue('order.isGift', checked, { shouldDirty: true });
    if (checked) {
      orderForm.setValue('values.totalValue', 0, { shouldDirty: true, shouldValidate: true });
      orderForm.setValue('values.depositValue', 0, { shouldDirty: true, shouldValidate: true });
    } else if (!paisInternacional) {
      orderForm.setValue('values.depositValue', DEFAULT_DEPOSIT_ARS, { shouldDirty: true, shouldValidate: true });
    }
  };
  const abcFields: AbecedarioFormFields = {
    abecedarioTipografia: orderForm.watch('order.abecedarioTipografia'),
    abecedarioAlturaMm: orderForm.watch('order.abecedarioAlturaMm'),
    abecedarioMayusculas: orderForm.watch('order.abecedarioMayusculas'),
    abecedarioMinusculas: orderForm.watch('order.abecedarioMinusculas'),
    abecedarioExtraLetterCounts: orderForm.watch('order.abecedarioExtraLetterCounts'),
    abecedarioSpecialCharsCount: orderForm.watch('order.abecedarioSpecialCharsCount'),
    abecedarioSpecialCharsDescription: orderForm.watch('order.abecedarioSpecialCharsDescription'),
    abecedarioCase: orderForm.watch('order.abecedarioCase'),
    abecedarioExtraLetters: orderForm.watch('order.abecedarioExtraLetters'),
  };
  const handleAbecedarioChange = (patch: Partial<AbecedarioFormFields>) => {
    writeAbecedarioFields(abcFields, patch, (key, value) => {
      orderForm.setValue(`order.${key}` as 'order.abecedarioTipografia', value as never);
    });
  };
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
    // La cotización automática no aplica a regalos ni pruebas.
    if (valoresBloqueados) return;
    if (!preciosCotizacion) return;
    const w = Number(wMm) || 0;
    const h = Number(hMm) || 0;
    if (w < 1 || h < 1) return;
    /** 1×1 mm = placeholder hasta que cargue medida (evita cotizar antes de escribir). */
    if (w === 1 && h === 1) return;
    const { anchoCm, altoCm } = mmPedidoAcm(w, h);
    const c = cotizarSelloRectangularCm(anchoCm, altoCm, preciosCotizacion);
    if (!c) return;
    orderForm.setValue('values.totalValue', arsAMonedaPedido(c.precioTransferencia), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [preciosCotizacion, selectedItemType, currentStep, wMm, hMm, orderForm, arsAMonedaPedido, valoresBloqueados]);

  useEffect(() => {
    if (!valoresBloqueados) {
      if (selectedItemType === 'SOLDADOR') {
        orderForm.setValue('values.totalValue', arsAMonedaPedido(75000));
      } else if (selectedItemType === 'MANGO_GOLPE') {
        orderForm.setValue('values.totalValue', arsAMonedaPedido(25000));
      } else if (selectedItemType === 'BASE_REMACHADORA') {
        orderForm.setValue('values.totalValue', arsAMonedaPedido(40000));
      }
    }
    if (selectedItemType !== 'SELLO') {
      orderForm.setValue('order.requestedWidthMm', 1);
      orderForm.setValue('order.requestedHeightMm', 1);
      orderForm.setValue('order.stampType', 'CLASICO');
    }
  }, [selectedItemType, orderForm, arsAMonedaPedido, valoresBloqueados]);

  const handleFileChange = (type: 'base' | 'vector' | 'photo', file: File | undefined) => {
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const resetDesignForm = useCallback(() => {
    orderForm.reset(emptyDesignFormValues);
    setFiles({});
    setMeasureInput('');
    setActiveSlot('new');
  }, [orderForm, emptyDesignFormValues]);

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
    [orderForm, emptyDesignFormValues],
  );

  /** Regalo/Prueba: valores en 0, marca de regalo según el tipo y sin envío en Prueba. */
  const applyOrderTypeToDesign = useCallback(
    (design: SavedDesignData): SavedDesignData => {
      if (orderType === 'VENTA') {
        return {
          ...design,
          order: { ...design.order, isGift: design.order.isGift === true },
          values: design.order.isGift === true ? { totalValue: 0, depositValue: 0 } : design.values,
        };
      }
      return {
        ...design,
        order: { ...design.order, isGift: orderType === 'REGALO' },
        values: { totalValue: 0, depositValue: 0 },
        shipping:
          orderType === 'PRUEBA'
            ? ({ ...design.shipping, carrier: undefined, service: undefined } as unknown as SavedDesignData['shipping'])
            : design.shipping,
      };
    },
    [orderType],
  );

  const captureCurrentDesign = useCallback((): SavedDesignData => {
    const values = orderForm.getValues();
    const itemType = values.order.itemType;
    return applyOrderTypeToDesign({
      order: {
        ...values.order,
        designName: itemType === 'SELLO' ? (values.order.designName || '') : '',
      },
      values: values.values,
      shipping: values.shipping,
      states: values.states,
      files: { ...files },
    } as SavedDesignData);
  }, [orderForm, files, applyOrderTypeToDesign]);

  const buildDesignPayload = (data: OrderFormData): SavedDesignData =>
    applyOrderTypeToDesign({
      ...data,
      order: {
        ...data.order,
        designName: selectedItemType === 'SELLO' ? (data.order.designName || '') : '',
      },
      files,
    } as SavedDesignData);

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
    if (data.orderType === 'PRUEBA') {
      // Prueba interna: cliente interno fijo, sin teléfono ni WhatsApp, sin internacional.
      onStepSubmit(
        {
          orderType: 'PRUEBA' as const,
          testReason: data.testReason?.trim() ?? '',
          attachGiftToOrderId: null,
          customer: {
            firstName: CLIENTE_PRUEBAS_NOMBRE,
            lastName: CLIENTE_PRUEBAS_APELLIDO,
            phoneE164: '',
            email: '',
            channel: 'OTRO' as const,
          },
          skipConfirmationWebhook: true,
          internationalCountryIso2: null,
        },
        1,
      );
      return;
    }
    onStepSubmit(
      {
        ...data,
        testReason: undefined,
        attachGiftToOrderId: data.orderType === 'REGALO' ? data.attachGiftToOrderId ?? null : null,
        internationalCountryIso2:
          data.orderType === 'VENTA' && data.isInternational ? data.internationalCountryIso2 ?? null : null,
      },
      1,
    );
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
        {/* Tipo de pedido */}
        <div className="space-y-3">
          <h3 className="text-lg font-medium">Tipo de pedido</h3>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tipo de pedido">
            {orderTypeOptions.map((opt) => {
              const selected = formOrderType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleOrderTypeChange(opt.value)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-white/15 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        {isPrueba && (
          <div className="space-y-2">
            <Label htmlFor="testReason">Motivo de la prueba *</Label>
            <Textarea
              id="testReason"
              rows={3}
              placeholder="Ej: probar bronce nuevo, calibrar la máquina, test de diseño…"
              {...customerForm.register('testReason')}
              className={customerForm.formState.errors.testReason ? 'border-red-500' : ''}
            />
            {customerForm.formState.errors.testReason && (
              <p className="text-xs text-red-500 mt-1">{customerForm.formState.errors.testReason.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Se carga al cliente interno “{CLIENTE_PRUEBAS_NOMBRE} – {CLIENTE_PRUEBAS_APELLIDO}”. No envía WhatsApp ni se despacha.
            </p>
          </div>
        )}

        {!isPrueba && (
        <>
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

        <div className="space-y-3 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="isInternational"
              checked={!!isInternational}
              disabled={isRegaloType}
              onCheckedChange={(c) => {
                const checked = c === true;
                customerForm.setValue('isInternational', checked, { shouldDirty: true });
                if (!checked) {
                  customerForm.setValue('internationalCountryIso2', null, { shouldDirty: true, shouldValidate: true });
                }
              }}
            />
            <Label htmlFor="isInternational" className="cursor-pointer text-sm font-normal leading-snug">
              Pedido internacional
              {isRegaloType && (
                <span className="ml-2 text-xs text-muted-foreground">(no disponible para regalos)</span>
              )}
            </Label>
          </div>
          {isInternational && (
            <div className="space-y-2 pl-7">
              <Label htmlFor="internationalCountryIso2">País *</Label>
              <Select
                value={customerForm.watch('internationalCountryIso2') ?? undefined}
                onValueChange={(value) =>
                  customerForm.setValue(
                    'internationalCountryIso2',
                    value as PaisInternacional['iso2'],
                    { shouldDirty: true, shouldValidate: true },
                  )
                }
              >
                <SelectTrigger
                  id="internationalCountryIso2"
                  className={customerForm.formState.errors.internationalCountryIso2 ? 'border-red-500' : ''}
                >
                  <SelectValue placeholder="Seleccionar país" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PAISES_INTERNACIONALES).map((pais) => (
                    <SelectItem key={pais.iso2} value={pais.iso2}>
                      {pais.nombre} ({pais.moneda})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerForm.formState.errors.internationalCountryIso2 && (
                <p className="text-xs text-red-500">
                  {customerForm.formState.errors.internationalCountryIso2.message}
                </p>
              )}
            </div>
          )}
        </div>

        {isRegaloType && (
          <div className="space-y-2 rounded-lg border border-pink-500/30 bg-pink-500/[0.05] px-4 py-3">
            <Label htmlFor="attachGiftToOrderId">Destino del regalo</Label>
            <Select
              value={watchedAttachId ?? 'NEW'}
              onValueChange={(value) =>
                customerForm.setValue('attachGiftToOrderId', value === 'NEW' ? null : value, { shouldDirty: true })
              }
            >
              <SelectTrigger id="attachGiftToOrderId">
                <SelectValue placeholder="Pedido de regalo aparte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">Pedido de regalo aparte</SelectItem>
                {openOrdersForGift.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    Sumar al pedido #{o.id.slice(0, 6)} (viaja junto) · {o.items.length} ítem
                    {o.items.length > 1 ? 's' : ''}
                    {o.items[0]?.designName ? ` · ${o.items[0].designName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {openOrdersForGift.length > 0
                ? 'El cliente tiene pedidos abiertos: podés sumar el regalo a uno (viaja junto) o cargarlo como pedido aparte.'
                : 'Sin cargo para el cliente. El envío lo paga Alcohn. Si el cliente tiene un pedido abierto (cargá su teléfono o email), vas a poder sumarlo a ese pedido.'}
            </p>
          </div>
        )}
        </>
        )}

        {!isPrueba && (
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
        )}

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
      {/* Resumen del tipo de pedido */}
      {orderType !== 'VENTA' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm">
          <OrderTypeBadge orderType={orderType} className="text-xs px-2 py-0.5" />
          <span className="font-medium text-muted-foreground">Sin cargo</span>
          {isPruebaOrder && initialData.testReason ? (
            <span className="text-muted-foreground">· Motivo: {initialData.testReason}</span>
          ) : null}
          {isRegaloOrder && !attachedOrder && (
            <span className="text-muted-foreground">
              · {initialData.customer?.firstName} {initialData.customer?.lastName} · el envío lo paga Alcohn
            </span>
          )}
          {isRegaloOrder && attachedOrder && (
            <span className="text-muted-foreground">
              · Se suma al pedido #{attachedOrder.id.slice(0, 6)} de {attachedOrder.customer.firstName}{' '}
              {attachedOrder.customer.lastName} (viaja junto)
            </span>
          )}
        </div>
      )}
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
                value={abcFields.abecedarioTipografia || ''}
                onChange={(e) => handleAbecedarioChange({ abecedarioTipografia: e.target.value })}
              />
            )}
          </div>
          {selectedItemType === 'ABECEDARIO' && (
            <AbecedarioFields
              values={abcFields}
              onChange={handleAbecedarioChange}
            />
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

      {/* Valores (ocultos en Regalo/Prueba: valor y seña = 0) */}
      {!isSinCargoOrder && (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">
          Valores{paisInternacional ? ` (${paisInternacional.moneda})` : ''}
        </h3>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-2">
            <Input
              id="totalValue"
              type="number"
              placeholder={paisInternacional ? `Valor Total (${paisInternacional.moneda}) *` : 'Valor Total *'}
              {...orderForm.register('values.totalValue', { valueAsNumber: true })}
              className={orderForm.formState.errors.values?.totalValue ? 'border-red-500' : ''}
              disabled={designIsGift || selectedItemType === 'SOLDADOR' || selectedItemType === 'MANGO_GOLPE' || selectedItemType === 'BASE_REMACHADORA'}
            />
            {orderForm.formState.errors.values?.totalValue && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values.totalValue.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Input
              id="depositValue"
              type="number"
              placeholder={paisInternacional ? `Seña (${paisInternacional.moneda})` : 'Seña'}
              {...orderForm.register('values.depositValue', { valueAsNumber: true })}
              className={orderForm.formState.errors.values?.depositValue ? 'border-red-500' : ''}
              disabled={designIsGift}
            />
            {orderForm.formState.errors.values?.depositValue && (
              <p className="text-xs text-red-500 mt-1">{orderForm.formState.errors.values.depositValue.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <Input
              value={
                designIsGift
                  ? 'Sin cargo'
                  : paisInternacional
                    ? formatMontoInternacional(restante, paisInternacional)
                    : `$${restante.toLocaleString()}`
              }
              disabled
              className="bg-muted"
              placeholder="Restante"
            />
          </div>
          <div className="col-span-6 flex items-center space-x-2">
            <Checkbox
              id="designIsGift"
              checked={designIsGift}
              onCheckedChange={(c) => handleDesignGiftToggle(c === true)}
            />
            <Label htmlFor="designIsGift" className="text-sm font-medium cursor-pointer">
              🎁 Regalo (sin cargo)
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Este diseño viaja con el pedido pero no se cobra.
              </span>
            </Label>
          </div>
        </div>
      </div>
      )}

      {/* Transportista y Estado de Fabricación */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{isPruebaOrder || attachedOrder ? 'Estado' : 'Transportista y Estado'}</h3>
        <div className="grid grid-cols-6 gap-4">
          {!isPruebaOrder && !attachedOrder && (
          <div className="col-span-3">
            <Select onValueChange={(value) => {
              const option = carrierOptions.find((o) => o.value === value);
              orderForm.setValue('shipping.carrier', option?.carrier, { shouldDirty: true, shouldValidate: true });
              orderForm.setValue('shipping.service', option?.service, { shouldDirty: true, shouldValidate: true });
            }} value={(() => {
              const carrier = orderForm.watch('shipping.carrier');
              const service = orderForm.watch('shipping.service');
              const match = carrierOptions.find((o) => o.carrier === carrier && o.service === service);
              return match?.value ?? 'NONE';
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
          )}
          <div className={!isPruebaOrder && !attachedOrder ? 'col-span-3' : 'col-span-6'}>
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
                  onCheckedChange={(checked) => orderForm.setValue('states.isPriority', checked === true, { shouldDirty: true })}
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
                      accept="image/*,.svg,.pdf,.ai,.eps,image/svg+xml"
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