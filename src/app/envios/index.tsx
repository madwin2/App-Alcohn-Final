import { useEffect, useMemo, useState } from 'react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useOrders } from '@/lib/hooks/useOrders';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatDate, formatDateTime, getShippingChipVisual, getShippingLabel } from '@/lib/utils/format';
import { Order, ShippingState } from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { supabase } from '@/lib/supabase/client';
import { CSV_FIELDS, createCorreoCsvRow } from '@/lib/utils/correoArgentinoCsv';
import { downloadCorreoCsv } from '@/lib/utils/micorreoUpload';
import {
  getMicorreoUploadQueueSize,
  isMicorreoUploadRunning,
  subscribeMicorreoUploadActivity,
  triggerMicorreoUploadForOrder,
} from '@/lib/utils/micorreoBackgroundUpload';
import { resolveCorreoCsvPaqueteFromOrderItems } from '@/lib/utils/correoCsvPackageFromOrder';
import { ParsedShippingData, parseShippingText } from '@/lib/utils/parseShippingText';
import {
  catalogAddressOptions,
  catalogContainsLocality,
  catalogContainsProvince,
  catalogContainsSucursalAddress,
  catalogLocalityOptions,
  catalogProvinceOptions,
  findPostalCodeInCatalog,
  type DireccionCatalogRow,
} from '@/lib/utils/enviosAddressCatalog';
import { emailToPersistOnCliente, resolveEnvioEmail } from '@/lib/utils/enviosEmail';
import { loadCorreoSucursalesCatalogCached } from '@/lib/utils/correoSucursalesCatalogCache';
import {
  snapFormToCorreoSucursalCatalog,
  snapProvinceToCorreoSucursalCatalog,
} from '@/lib/utils/enviosSucursalSnap';
import {
  canonicalizeProvince,
  normalizeLocality,
  normalizeLocalityForCorreo,
  normalizeLocalityWhileTyping,
  normalizePhoneDigits,
  normalizePhoneDigitsForEnvios,
  stripAccents,
} from '@/lib/utils/shippingNormalization';
import { ChevronDown, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const isEligibleForShipping = (order: Order): boolean => {
  if (!order.items.length) return false;

  const allDone = order.items.every((item) => item.fabricationState === 'HECHO');
  // Estado de venta: cualquiera excepto Deudor.
  const hasDebtorState =
    order.saleStateOrder === 'DEUDOR' || order.items.some((item) => item.saleState === 'DEUDOR');
  // Estado de envío: incluir todos menos Seguimiento Enviado.
  const hasTrackingSent = order.items.some((item) => item.shippingState === 'SEGUIMIENTO_ENVIADO');

  return allDone && !hasTrackingSent && !hasDebtorState;
};

const getRepresentativeItem = (order: Order) => {
  if (!order.items.length) return null;
  return order.items.find((item) => item.files?.baseUrl || item.files?.vectorPreviewUrl) || order.items[0];
};

type ShippingAddressRow = {
  id: string;
  nombre: string;
  apellido: string;
  domicilio: string;
  localidad: string;
  provincia: string;
  codigo_sucursal_micorreo?: string | null;
  created_at?: string | null;
};

const normalizeDestRecipientName = (nombre: string, apellido: string): string =>
  stripAccents(`${nombre} ${apellido}`.trim().toLowerCase().replace(/\s+/g, ' '));

const formatShippingDestination = (
  order: Order,
  address: ShippingAddressRow | undefined,
): string => {
  if (!address) return '—';
  const isSucursal = order.shipping.service === 'SUCURSAL';
  if (isSucursal) {
    const branch = address.domicilio?.trim();
    const locality = address.localidad?.trim();
    return branch || locality || '—';
  }
  const parts = [address.domicilio, address.localidad, address.provincia].map((p) => p?.trim()).filter(Boolean);
  return parts.join(', ') || '—';
};

const isSaleReadyForShippingData = (order: Order): boolean => {
  if (!order.items.length) return false;
  return order.items.every(
    (item) => item.saleState === 'FOTO_ENVIADA' || item.saleState === 'TRANSFERIDO'
  );
};

/** Ícono WhatsApp (marca registrada Meta); solo UI. */
function WhatsappLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.372a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}


interface ShippingFormData {
  fullName: string;
  province: string;
  locality: string;
  address: string;
  postalCode: string;
  email: string;
  phone: string;
}

const emptyForm: ShippingFormData = {
  fullName: '',
  province: '',
  locality: '',
  address: '',
  postalCode: '',
  email: '',
  phone: '',
};

/** Valor Radix para «dejar vacío» en desplegables de sucursal. */
const SELECT_EMPTY_VALUE = '__empty__';

const shippingStateOptions: ShippingState[] = [
  'SIN_ENVIO',
  'HACER_ETIQUETA',
  'ERROR_ETIQUETA',
  'ETIQUETA_LISTA',
  'DESPACHADO',
  'SEGUIMIENTO_ENVIADO',
];

const mergeShippingData = (
  fallbackData: ParsedShippingData,
  aiData?: Partial<ParsedShippingData> | null,
): ShippingFormData => {
  if (!aiData) return fallbackData;
  return {
    fullName: aiData.fullName?.trim() || fallbackData.fullName,
    province: aiData.province?.trim() || fallbackData.province,
    locality: aiData.locality?.trim() || fallbackData.locality,
    address: aiData.address?.trim() || fallbackData.address,
    postalCode: aiData.postalCode?.trim() || fallbackData.postalCode,
    email: aiData.email?.trim() || fallbackData.email,
    phone: aiData.phone?.trim() || fallbackData.phone,
  };
};

const normalizeShippingFormData = (data: ShippingFormData): ShippingFormData => {
  const canonicalProvince = canonicalizeProvince(data.province);
  const province = stripAccents(canonicalProvince || data.province.trim());
  return {
    ...data,
    fullName: stripAccents(data.fullName.trim()),
    province,
    locality: normalizeLocalityForCorreo(canonicalProvince, data.locality),
    address: stripAccents(data.address.trim()),
    postalCode: data.postalCode.trim(),
    email: data.email.trim(),
    phone: normalizePhoneDigitsForEnvios(data.phone),
  };
};

export default function EnviosPage() {
  const { orders, loading, error, updateOrder, fetchOrders } = useOrders();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [micorreoUploadBusy, setMicorreoUploadBusy] = useState(false);
  const [micorreoQueueSize, setMicorreoQueueSize] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [shippingTypeDraft, setShippingTypeDraft] = useState<'DOMICILIO' | 'SUCURSAL'>('DOMICILIO');
  const [rawShippingText, setRawShippingText] = useState('');
  const [shippingForm, setShippingForm] = useState<ShippingFormData>(emptyForm);
  const [showParseConfirmation, setShowParseConfirmation] = useState(false);
  const [isSavingShippingData, setIsSavingShippingData] = useState(false);
  const [isParsingWithAi, setIsParsingWithAi] = useState(false);
  const [isLoadingExistingShippingData, setIsLoadingExistingShippingData] = useState(false);
  const [lastCsvSkipped, setLastCsvSkipped] = useState<Array<{ orderId: string; reason: string }>>([]);
  const [isConDatosExpanded, setIsConDatosExpanded] = useState(true);
  const [isPendientesExpanded, setIsPendientesExpanded] = useState(true);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [manualSucursalCode, setManualSucursalCode] = useState('');
  const [addressCatalogRows, setAddressCatalogRows] = useState<DireccionCatalogRow[]>([]);
  const [isLoadingAddressCatalog, setIsLoadingAddressCatalog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingAddressCatalog(true);
    void (async () => {
      try {
        const rows = await loadCorreoSucursalesCatalogCached();
        if (!cancelled) {
          if (!rows.length) {
            toast({
              title: 'Catálogo incompleto',
              description:
                'Revisá la tabla `correo_sucursales` (padrón MiCorreo) y permisos RLS. Los desplegables de sucursal usan solo esa tabla.',
              variant: 'destructive',
            });
          }
          setAddressCatalogRows(rows);
        }
      } catch (e) {
        console.error('Catálogo sucursales (correo_sucursales):', e);
        if (!cancelled) {
          toast({
            title: 'Catálogo incompleto',
            description:
              'Revisá la tabla `correo_sucursales` (padrón MiCorreo) y permisos RLS. Los desplegables de sucursal usan solo esa tabla.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setIsLoadingAddressCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const syncMicorreoActivity = () => {
      setMicorreoUploadBusy(isMicorreoUploadRunning());
      setMicorreoQueueSize(getMicorreoUploadQueueSize());
    };
    syncMicorreoActivity();
    return subscribeMicorreoUploadActivity(syncMicorreoActivity);
  }, []);

  useEffect(() => {
    if (!micorreoUploadBusy) return;
    const intervalId = window.setInterval(() => {
      void fetchOrders();
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [micorreoUploadBusy, fetchOrders]);

  const provinceSelectOptions = useMemo(
    () => catalogProvinceOptions(addressCatalogRows).map(stripAccents),
    [addressCatalogRows],
  );

  const localitySelectOptions = useMemo(() => {
    const pCanon = canonicalizeProvince(shippingForm.province) || shippingForm.province.trim();
    if (!pCanon) return [];
    return catalogLocalityOptions(addressCatalogRows, pCanon).map(stripAccents);
  }, [addressCatalogRows, shippingForm.province]);

  const addressSelectOptions = useMemo(() => {
    const pCanon = canonicalizeProvince(shippingForm.province) || shippingForm.province.trim();
    if (!pCanon) return [];
    const loc =
      pCanon === 'Capital Federal'
        ? localitySelectOptions[0] || shippingForm.locality.trim()
        : shippingForm.locality.trim();
    return catalogAddressOptions(addressCatalogRows, pCanon, loc).map(stripAccents);
  }, [addressCatalogRows, shippingForm.province, shippingForm.locality, localitySelectOptions]);

  const sucursalAddressOptionsWithCode = useMemo(() => {
    const pCanon = canonicalizeProvince(shippingForm.province) || shippingForm.province.trim();
    if (!pCanon) return [];
    const loc =
      pCanon === 'Capital Federal'
        ? catalogLocalityOptions(addressCatalogRows, pCanon)[0] || shippingForm.locality.trim()
        : shippingForm.locality.trim();
    if (!loc) return [];

    const items = addressCatalogRows
      .filter((r) => Boolean(r.codigo_sucursal))
      .filter((r) => (canonicalizeProvince(r.provincia) || r.provincia.trim()) === pCanon)
      .filter((r) => normalizeLocality(r.localidad) === normalizeLocality(loc))
      .map((r) => {
        const domicilio = stripAccents((r.domicilio || '').trim());
        const codigo = (r.codigo_sucursal || '').trim();
        return {
          domicilio,
          codigo,
          value: `${domicilio}||${codigo}`,
        };
      })
      .filter((x) => x.domicilio && x.codigo);

    items.sort((a, b) => a.domicilio.localeCompare(b.domicilio, 'es'));
    return items;
  }, [addressCatalogRows, shippingForm.province, shippingForm.locality]);

  /** Padrón MiCorreo (`correo_sucursales`) para provincia (domicilio y sucursal). */
  const hasAddressCatalog = addressCatalogRows.length > 0;

  /** Tras cargar el padrón o interpretar texto, alinear valores a opciones del catálogo. */
  useEffect(() => {
    if (!selectedOrder || !addressCatalogRows.length) return;
    if (shippingTypeDraft === 'SUCURSAL') {
      const snapped = snapFormToCorreoSucursalCatalog(
        {
          province: shippingForm.province,
          locality: shippingForm.locality,
          address: shippingForm.address,
          postalCode: shippingForm.postalCode,
        },
        addressCatalogRows,
      );
      setShippingForm((prev) => {
        if (
          prev.province === snapped.province &&
          prev.locality === snapped.locality &&
          prev.address === snapped.address &&
          prev.postalCode === snapped.postalCode
        ) {
          return prev;
        }
        return normalizeShippingFormData({ ...prev, ...snapped });
      });
    } else {
      const snappedProvince = snapProvinceToCorreoSucursalCatalog(shippingForm.province, addressCatalogRows);
      if (!snappedProvince || snappedProvince === shippingForm.province) return;
      setShippingForm((prev) =>
        normalizeShippingFormData({
          ...prev,
          province: snappedProvince,
          locality: prev.locality,
        }),
      );
    }
    // Solo re-snap cuando cambia el padrón o el tipo; no en cada tecla del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressCatalogRows, shippingTypeDraft, selectedOrder?.id]);

  const eligibleOrders = useMemo(() => {
    return orders.filter(isEligibleForShipping);
  }, [orders]);

  /** CSV manual de respaldo: solo órdenes en Hacer Etiqueta (fallo de sistema / carga manual en MiCorreo). */
  const csvOrders = useMemo(() => {
    return eligibleOrders.filter((order) => {
      if (!order.direccionId) return false;
      return order.items[0]?.shippingState === 'HACER_ETIQUETA';
    });
  }, [eligibleOrders]);

  const ordersConDatosEnvio = useMemo(
    () => eligibleOrders.filter((order) => Boolean(order.direccionId)),
    [eligibleOrders],
  );
  const ordersPendientesDatos = useMemo(
    () => eligibleOrders.filter((order) => !order.direccionId && isSaleReadyForShippingData(order)),
    [eligibleOrders],
  );

  const [shippingAddressById, setShippingAddressById] = useState<Map<string, ShippingAddressRow>>(new Map());

  useEffect(() => {
    const addressIds = [...new Set(ordersConDatosEnvio.map((order) => order.direccionId).filter(Boolean))] as string[];
    if (!addressIds.length) {
      setShippingAddressById(new Map());
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error: addressError } = await supabase
        .from('direcciones')
        .select('id,nombre,apellido,domicilio,localidad,provincia,codigo_sucursal_micorreo,created_at')
        .in('id', addressIds);
      if (cancelled) return;
      if (addressError) {
        console.error('Cargar direcciones para tabla de envíos:', addressError);
        return;
      }
      setShippingAddressById(new Map((data ?? []).map((row) => [row.id, row as ShippingAddressRow])));
    })();

    return () => {
      cancelled = true;
    };
  }, [ordersConDatosEnvio]);

  const duplicateDestRecipientNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of ordersConDatosEnvio) {
      if (!order.direccionId) continue;
      const address = shippingAddressById.get(order.direccionId);
      if (!address) continue;
      const key = normalizeDestRecipientName(address.nombre || '', address.apellido || '');
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [ordersConDatosEnvio, shippingAddressById]);

  /** Índice de fila tal como sale en el CSV (fila 1 = encabezado → primera orden es 2). */
  const csvLineNumberByOrderId = useMemo(() => {
    const m = new Map<string, number>();
    csvOrders.forEach((order, index) => m.set(order.id, index + 2));
    return m;
  }, [csvOrders]);

  const [isBulkResettingEnvio, setIsBulkResettingEnvio] = useState(false);

  const handleToggleShippingType = async (order: Order, type: 'DOMICILIO' | 'SUCURSAL') => {
    try {
      await updateOrder(order.id, {
        shipping: {
          ...order.shipping,
          carrier: 'CORREO_ARGENTINO',
          service: type,
        },
      });
      toast({
        title: 'Tipo de envío actualizado',
        description: `La orden quedó en ${type === 'DOMICILIO' ? 'Domicilio' : 'Sucursal'} con Correo Argentino.`,
      });
    } catch (toggleError) {
      toast({
        title: 'No se pudo actualizar',
        description: 'Hubo un error cambiando el tipo de envío.',
        variant: 'destructive',
      });
    }
  };

  const handleBulkResetSinEnvioConDatos = async () => {
    if (!ordersConDatosEnvio.length) return;
    const n = ordersConDatosEnvio.length;
    if (
      !window.confirm(
        `¿Marcar «Sin envío» en todos los sellos de las ${n} órdenes de esta tabla? (Útil si hubo error en el CSV y querés recomenzar.)`,
      )
    ) {
      return;
    }
    setIsBulkResettingEnvio(true);
    try {
      for (const order of ordersConDatosEnvio) {
        await updateOrder(order.id, {
          items: order.items.map((item) => ({
            id: item.id,
            shippingState: 'SIN_ENVIO',
          })) as any,
        });
      }
      toast({
        title: 'Estados reiniciados',
        description: `Se actualizaron ${n} órdenes a Sin envío.`,
      });
    } catch (bulkError) {
      toast({
        title: 'No se pudo reiniciar',
        description: bulkError instanceof Error ? bulkError.message : 'Error desconocido.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkResettingEnvio(false);
    }
  };

  const handleShippingStateChange = async (order: Order, newState: ShippingState) => {
    try {
      const updates: Parameters<typeof updateOrder>[1] = {
        items: order.items.map((item) => ({
          id: item.id,
          shippingState: newState,
        })) as any,
      };

      if (newState === 'SEGUIMIENTO_ENVIADO') {
        updates.saleStateOrder = 'TRANSFERIDO';
        updates.items = order.items.map((item) => ({
          id: item.id,
          shippingState: newState,
          saleState: item.saleState === 'TRANSFERIDO' ? item.saleState : 'TRANSFERIDO',
        })) as any;
      }

      await updateOrder(order.id, updates);
      toast({
        title: 'Estado de envío actualizado',
        description: `La orden quedó en ${getShippingLabel(newState)}.`,
      });
    } catch (stateError) {
      toast({
        title: 'No se pudo actualizar el estado',
        description: stateError instanceof Error ? stateError.message : 'Hubo un error cambiando el estado de envío.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateCsv = async () => {
    if (!csvOrders.length) return;
    setIsGeneratingCsv(true);
    setLastCsvSkipped([]);

    try {
      const orderIds = csvOrders.map((order) => order.id);
      const customerIds = [...new Set(csvOrders.map((order) => order.customer.id))];

      const { data: dbOrders, error: dbOrdersError } = await supabase
        .from('ordenes')
        .select('id,direccion_id,cliente_id,tipo_envio')
        .in('id', orderIds);

      if (dbOrdersError) throw dbOrdersError;

      const addressIds = (dbOrders ?? []).map((row) => row.direccion_id).filter(Boolean) as string[];
      const { data: addresses, error: addressesError } = addressIds.length
        ? await supabase
            .from('direcciones')
            .select('id,provincia,localidad,domicilio,codigo_postal,nombre,apellido,telefono,codigo_sucursal_micorreo')
            .in('id', addressIds)
        : { data: [], error: null };

      if (addressesError) throw addressesError;

      const { data: customers, error: customersError } = await supabase
        .from('clientes')
        .select('id,mail')
        .in('id', customerIds);
      if (customersError) throw customersError;

      const addressById = new Map((addresses ?? []).map((address) => [address.id, address]));
      const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
      const dbOrderById = new Map((dbOrders ?? []).map((order) => [order.id, order]));

      const rows: string[][] = [];
      /** Ids de órdenes cuya fila salió en el CSV (el campo `numero_orden` no se rellena, no se puede deducir del archivo). */
      const exportedOrderIdsInOrder: string[] = [];
      const skipped: Array<{ orderId: string; reason: string }> = [];

      for (const order of csvOrders) {
        const dbOrder = dbOrderById.get(order.id);
        const address = dbOrder?.direccion_id ? addressById.get(dbOrder.direccion_id) : null;

        if (!dbOrder || !address) {
          skipped.push({ orderId: order.id, reason: 'La orden no tiene dirección vinculada en Supabase.' });
          continue;
        }

        const isSucursal = (order.shipping.service === 'SUCURSAL') || dbOrder.tipo_envio === 'Sucursal';
        const codigoGuardado = ((address as { codigo_sucursal_micorreo?: string | null }).codigo_sucursal_micorreo || '')
          .trim();
        const paquete = resolveCorreoCsvPaqueteFromOrderItems(order.items);
        const csvRow = await createCorreoCsvRow({
          provincia: address.provincia || '',
          localidad: address.localidad || '',
          domicilio: address.domicilio || '',
          codigoPostal: address.codigo_postal || '',
          nombreCompleto: `${address.nombre || order.customer.firstName} ${address.apellido || order.customer.lastName}`,
          email: resolveEnvioEmail({
            customerEmail: customerById.get(order.customer.id)?.mail || order.customer.email,
          }),
          telefono: address.telefono || order.customer.phoneE164 || '',
          tipoEnvio: isSucursal ? 'Sucursal' : 'Domicilio',
          codigoSucursalManual: isSucursal && codigoGuardado ? codigoGuardado : undefined,
          paquete,
        });

        if (!csvRow.ok) {
          skipped.push({ orderId: order.id, reason: csvRow.reason });
          continue;
        }

        rows.push(csvRow.row);
        exportedOrderIdsInOrder.push(order.id);
      }

      const skippedIdSet = new Set(skipped.map((entry) => entry.orderId));
      const skippedOrders = csvOrders.filter((order) => skippedIdSet.has(order.id));

      // Órdenes que no generaron fila válida: quedan en Error de Etiqueta (rojo) y se excluyen del próximo CSV hasta corregir.
      for (const order of skippedOrders) {
        await updateOrder(order.id, {
          items: order.items.map((item) => ({
            id: item.id,
            shippingState: 'ERROR_ETIQUETA',
          })) as any,
        });
      }

      if (!rows.length) {
        await fetchOrders();
        setLastCsvSkipped(skipped);
        const primerMotivo = skipped[0]
          ? `${skipped[0].orderId.slice(0, 8)}…: ${skipped[0].reason}`
          : 'No hay filas exportables (revisar provincia, calle, sucursal o padrón CSV en el deploy).';
        toast({
          title: 'No se pudo generar el CSV',
          description: `${primerMotivo}${skipped.length > 1 ? ` (+${skipped.length - 1} más en el listado de abajo)` : ''} Las órdenes con fallo quedaron en Error de Etiqueta.`,
          variant: 'destructive',
        });
        return;
      }

      const csvBody = rows.map((row) => row.join(';')).join('\n');
      const csvContent = `${CSV_FIELDS.join(';')}\n${csvBody}`;
      const csvFilename = `carga_correo_${new Date().toISOString().slice(0, 10)}.csv`;

      downloadCorreoCsv(csvContent, csvFilename);

      await fetchOrders();
      setLastCsvSkipped(skipped);
      toast({
        title: 'CSV descargado',
        description:
          skipped.length > 0
            ? `Se exportaron ${rows.length} filas en Hacer Etiqueta. ${skipped.length} con fallo de validación pasaron a Error de Etiqueta.`
            : `Se exportaron ${rows.length} filas para carga manual en MiCorreo (solo pedidos en Hacer Etiqueta).`,
      });
    } catch (generateError) {
      const msg =
        generateError && typeof generateError === 'object' && 'message' in generateError
          ? String((generateError as { message: string }).message)
          : String(generateError);
      console.error('Generar CSV:', generateError);
      toast({
        title: 'Error al generar CSV',
        description: msg || 'No se pudo completar la exportación.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCsv(false);
    }
  };

  const openShippingDialog = async (order: Order) => {
    if (!order.shipping.service) {
      toast({
        title: 'Seleccioná tipo de envío',
        description: 'Primero marcá Domicilio o Sucursal para poder cargar los datos.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedOrder(order);
    setShippingTypeDraft(order.shipping.service === 'SUCURSAL' ? 'SUCURSAL' : 'DOMICILIO');
    setRawShippingText('');
    setManualSucursalCode('');
    setShippingForm(
      normalizeShippingFormData({
        ...emptyForm,
        fullName: `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim(),
        email: resolveEnvioEmail({ customerEmail: order.customer.email }),
        phone: normalizePhoneDigitsForEnvios(order.customer.phoneE164 || ''),
      }),
    );
    setShowParseConfirmation(false);

    if (!order.direccionId) return;

    setIsLoadingExistingShippingData(true);
    try {
      const { data: existingAddress, error: existingAddressError } = await supabase
        .from('direcciones')
        .select('provincia,localidad,domicilio,codigo_postal,nombre,apellido,telefono,codigo_sucursal_micorreo')
        .eq('id', order.direccionId)
        .single();
      if (existingAddressError) throw existingAddressError;

      const fullName = `${existingAddress?.nombre || order.customer.firstName || ''} ${existingAddress?.apellido || order.customer.lastName || ''}`.trim();
      const canonProv = canonicalizeProvince(existingAddress?.provincia || '');
      setShippingForm(
        normalizeShippingFormData({
          fullName,
          province: canonProv || (existingAddress?.provincia || '').trim(),
          locality: existingAddress?.localidad || '',
          address: existingAddress?.domicilio || '',
          postalCode: existingAddress?.codigo_postal || '',
          email: resolveEnvioEmail({ customerEmail: order.customer.email }),
          phone: normalizePhoneDigitsForEnvios(existingAddress?.telefono || order.customer.phoneE164 || ''),
        }),
      );
      setManualSucursalCode(
        ((existingAddress as { codigo_sucursal_micorreo?: string | null })?.codigo_sucursal_micorreo || '').trim(),
      );
    } catch (existingAddressLoadError) {
      toast({
        title: 'No se pudieron cargar los datos actuales',
        description: 'Podés editarlos manualmente y volver a guardar.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingExistingShippingData(false);
    }
  };

  const closeShippingDialog = () => {
    setSelectedOrder(null);
    setRawShippingText('');
    setManualSucursalCode('');
    setShippingForm(emptyForm);
    setShowParseConfirmation(false);
  };

  const handleParse = async () => {
    if (!rawShippingText.trim()) {
      toast({
        title: 'Texto vacío',
        description: 'Pegá primero los datos del cliente para interpretar.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedOrder) return;

    setIsParsingWithAi(true);
    try {
      const response = await fetch('/api/parse-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawShippingText }),
      });

      if (!response.ok) {
        let details = '';
        try {
          const errJson = await response.json();
          details = errJson?.details || errJson?.error || errJson?.message || '';
        } catch {
          // ignore JSON parsing error
        }
        throw new Error(`[${response.status}] ${details || 'Error al llamar /api/parse-shipping'}`);
      }

      const json = await response.json();
      const aiData = (json?.parsed ?? null) as Partial<ParsedShippingData> | null;
      if (!aiData) {
        throw new Error('La respuesta de IA no devolvió campos parseados.');
      }

      // IA obligatoria: se usa IA y se completa con parser local solo en campos faltantes.
      const fallbackData = parseShippingText(rawShippingText);
      const merged = mergeShippingData(fallbackData, aiData);
      // Siempre el teléfono del cliente en el sistema: el texto pegado suele traer números erróneos.
      const phoneFromOrder = normalizePhoneDigitsForEnvios(selectedOrder.customer.phoneE164 || '');
      const parsedData: ShippingFormData = {
        ...merged,
        email: resolveEnvioEmail({
          customerEmail: selectedOrder.customer.email,
          parsedEmail: merged.email,
        }),
        phone: phoneFromOrder,
      };

      const normalized = normalizeShippingFormData(parsedData);
      if (addressCatalogRows.length > 0) {
        if (shippingTypeDraft === 'SUCURSAL') {
          const snapped = snapFormToCorreoSucursalCatalog(
            {
              province: normalized.province,
              locality: normalized.locality,
              address: normalized.address,
              postalCode: normalized.postalCode,
            },
            addressCatalogRows,
          );
          setShippingForm({
            ...normalized,
            province: snapped.province,
            locality: snapped.locality,
            address: snapped.address,
            postalCode: snapped.postalCode,
          });
        } else {
          const snappedProvince = snapProvinceToCorreoSucursalCatalog(
            normalized.province,
            addressCatalogRows,
          );
          setShippingForm({
            ...normalized,
            province: snappedProvince || normalized.province,
            locality: normalizeLocalityForCorreo(
              snappedProvince || normalized.province,
              normalized.locality,
            ),
          });
        }
      } else {
        setShippingForm(normalized);
      }
      setShowParseConfirmation(false);
      toast({
        title: 'Parseo IA listo',
        description:
          addressCatalogRows.length > 0
            ? 'Se interpretó y se ajustó al padrón Correo (provincia y, en sucursal, localidad/oficina) cuando hubo coincidencia.'
            : 'Se interpretó con IA. Revisá antes de confirmar.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo usar IA',
        description:
          error instanceof Error
            ? `${error.message}. Revisá OPENAI_API_KEY en Vercel y redeploy.`
            : 'Revisá OPENAI_API_KEY en Vercel y redeploy.',
        variant: 'destructive',
      });
    } finally {
      setIsParsingWithAi(false);
    }
  };

  const handleSaveShippingData = async () => {
    if (!selectedOrder) return;

    setIsSavingShippingData(true);
    try {
      const normalizedForm = normalizeShippingFormData(shippingForm);
      const canonicalProvince = canonicalizeProvince(normalizedForm.province);
      if (!canonicalProvince) {
        toast({
          title: 'Provincia inválida',
          description: 'Elegí una provincia del desplegable (padrón Correo Argentino).',
          variant: 'destructive',
        });
        return;
      }

      if (!hasAddressCatalog) {
        toast({
          title: 'Padrón no disponible',
          description:
            'No se pudo cargar `correo_sucursales`. Revisá la tabla y permisos antes de guardar.',
          variant: 'destructive',
        });
        return;
      }

      if (!catalogContainsProvince(addressCatalogRows, canonicalProvince)) {
        toast({
          title: 'Provincia no válida',
          description: 'La provincia debe ser una de las que figuran en el padrón de Correo Argentino.',
          variant: 'destructive',
        });
        return;
      }

      if (shippingTypeDraft === 'SUCURSAL' && !manualSucursalCode.trim()) {
        if (!catalogContainsLocality(addressCatalogRows, canonicalProvince, normalizedForm.locality)) {
          toast({
            title: 'Localidad no válida',
            description: 'Elegí una localidad del desplegable (padrón Correo). No se acepta texto libre.',
            variant: 'destructive',
          });
          return;
        }
        if (
          !catalogContainsSucursalAddress(
            addressCatalogRows,
            canonicalProvince,
            normalizedForm.locality,
            normalizedForm.address,
          )
        ) {
          toast({
            title: 'Sucursal no válida',
            description: 'Elegí la dirección de la sucursal en el desplegable o ingresá el código MiCorreo a mano.',
            variant: 'destructive',
          });
          return;
        }
      }

      const cleanName = normalizedForm.fullName.trim();
      const nameParts = cleanName.split(' ').filter(Boolean);
      const firstName = nameParts[0] ?? selectedOrder.customer.firstName;
      const lastName = nameParts.slice(1).join(' ') || selectedOrder.customer.lastName || '-';

      const codigoSucursalDb =
        shippingTypeDraft === 'SUCURSAL' && manualSucursalCode.trim()
          ? manualSucursalCode.trim()
          : null;

      const { data: addressRow, error: addressError } = await supabase
        .from('direcciones')
        .insert({
          cliente_id: selectedOrder.customer.id,
          activa: true,
          codigo_postal: normalizedForm.postalCode || '0000',
          provincia: normalizedForm.province || 'SIN DEFINIR',
          localidad:
            normalizeLocalityForCorreo(canonicalProvince, normalizedForm.locality) || 'SIN DEFINIR',
          domicilio: normalizedForm.address || 'SIN DEFINIR',
          codigo_sucursal_micorreo: codigoSucursalDb,
          nombre: firstName,
          apellido: lastName,
          telefono: normalizePhoneDigitsForEnvios(normalizedForm.phone) || null,
          dni: null,
        })
        .select('id')
        .single();

      if (addressError) throw addressError;

      const shippingTypeDb = shippingTypeDraft === 'SUCURSAL' ? 'Sucursal' : 'Domicilio';
      const isEditingExistingShippingData = Boolean(selectedOrder.direccionId);

      const orderUpdate: Record<string, unknown> = {
        direccion_id: addressRow.id,
        tipo_envio: shippingTypeDb,
      };
      if (isEditingExistingShippingData) {
        orderUpdate.envio_datos_editado = true;
      } else if (user?.id) {
        orderUpdate.envio_datos_cargado_por = user.id;
        orderUpdate.envio_datos_cargado_at = new Date().toISOString();
        orderUpdate.envio_datos_editado = false;
      }

      const { error: orderError } = await supabase
        .from('ordenes')
        .update(orderUpdate)
        .eq('id', selectedOrder.id);

      if (orderError) throw orderError;

      const mailParaCliente = emailToPersistOnCliente({
        customerEmail: selectedOrder.customer.email,
        parsedEmail: normalizedForm.email,
      });
      if (mailParaCliente) {
        await supabase
          .from('clientes')
          .update({ mail: mailParaCliente })
          .eq('id', selectedOrder.customer.id);
      }

      const needsTransfer = selectedOrder.saleStateOrder !== 'TRANSFERIDO';
      if (needsTransfer) {
        await updateOrder(selectedOrder.id, {
          saleStateOrder: 'TRANSFERIDO',
          items: selectedOrder.items.map((item) => ({
            id: item.id,
            saleState: item.saleState === 'TRANSFERIDO' ? item.saleState : 'TRANSFERIDO',
          })) as any,
        });
      }

      await fetchOrders();
      const orderIdForUpload = selectedOrder.id;
      closeShippingDialog();
      const queueBefore = getMicorreoUploadQueueSize();
      triggerMicorreoUploadForOrder(orderIdForUpload, () => {
        void fetchOrders();
      });
      toast({
        title: 'Datos de envío guardados',
        description:
          queueBefore > 0
            ? `MiCorreo: en cola (${queueBefore} antes). Se sube de a una con pausa entre cargas.`
            : 'MiCorreo: subiendo la etiqueta en segundo plano. Podés seguir usando la app.',
      });
    } catch (saveError) {
      toast({
        title: 'Error al guardar datos',
        description: saveError instanceof Error ? saveError.message : 'No se pudo guardar la información.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingShippingData(false);
    }
  };

  const handleClearShippingData = async (order: Order) => {
    if (!order.direccionId) return;
    if (
      !window.confirm(
        '¿Quitar los datos de envío de esta orden? La orden volverá a pendientes de cargar datos si corresponde.',
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase
        .from('ordenes')
        .update({
          direccion_id: null,
          envio_datos_cargado_por: null,
          envio_datos_cargado_at: null,
          envio_datos_editado: false,
        })
        .eq('id', order.id);
      if (error) throw error;
      await fetchOrders();
      toast({ title: 'Datos de envío quitados', description: 'La orden ya no tiene dirección vinculada.' });
    } catch (e) {
      toast({
        title: 'No se pudo quitar',
        description: e instanceof Error ? e.message : 'Error al actualizar la orden.',
        variant: 'destructive',
      });
    }
  };

  const handleContinueToConfirmation = async () => {
    if (!selectedOrder) return;
    try {
      const normalizedForm = normalizeShippingFormData(shippingForm);
      const canonicalProvince = canonicalizeProvince(normalizedForm.province);
      if (!canonicalProvince || !hasAddressCatalog || !catalogContainsProvince(addressCatalogRows, canonicalProvince)) {
        toast({
          title: 'Provincia no válida',
          description: 'Elegí una provincia del desplegable (padrón Correo Argentino).',
          variant: 'destructive',
        });
        return;
      }
      if (shippingTypeDraft === 'SUCURSAL') {
        const manual = manualSucursalCode.trim();
        if (!manual) {
          const missing =
            !normalizedForm.province?.trim() ||
            !normalizedForm.locality?.trim() ||
            !normalizedForm.address?.trim();
          if (missing) {
            toast({
              title: 'Sucursal incompleta',
              description:
                'Elegí provincia, localidad y oficina en los desplegables del padrón, o ingresá el código de sucursal MiCorreo a mano.',
              variant: 'destructive',
            });
            return;
          }
          if (!catalogContainsLocality(addressCatalogRows, canonicalProvince, normalizedForm.locality)) {
            toast({
              title: 'Localidad no válida',
              description: 'Elegí una localidad del desplegable (padrón Correo).',
              variant: 'destructive',
            });
            return;
          }
          if (
            !catalogContainsSucursalAddress(
              addressCatalogRows,
              canonicalProvince,
              normalizedForm.locality,
              normalizedForm.address,
            )
          ) {
            toast({
              title: 'Sucursal no válida',
              description: 'Elegí la oficina en el desplegable del padrón.',
              variant: 'destructive',
            });
            return;
          }
        }
      }
      const paquete = resolveCorreoCsvPaqueteFromOrderItems(selectedOrder.items);
      const csvRow = await createCorreoCsvRow({
        provincia: normalizedForm.province || '',
        localidad: normalizedForm.locality || '',
        domicilio: normalizedForm.address || '',
        codigoPostal: normalizedForm.postalCode || '',
        nombreCompleto: normalizedForm.fullName || `${selectedOrder.customer.firstName} ${selectedOrder.customer.lastName}`,
        email: resolveEnvioEmail({
          customerEmail: selectedOrder.customer.email,
          parsedEmail: selectedOrder.customer.email?.trim()
            ? undefined
            : normalizedForm.email,
        }),
        telefono: normalizedForm.phone || selectedOrder.customer.phoneE164 || '',
        tipoEnvio: shippingTypeDraft === 'SUCURSAL' ? 'Sucursal' : 'Domicilio',
        codigoSucursalManual:
          shippingTypeDraft === 'SUCURSAL' ? manualSucursalCode.trim() || undefined : undefined,
        paquete,
      });

      if (!csvRow.ok) {
        toast({
          title: 'Dato inválido para CSV',
          description: csvRow.reason,
          variant: 'destructive',
        });
        return;
      }

      setShowParseConfirmation(true);
    } catch (validationError) {
      toast({
        title: 'Error validando datos',
        description: validationError instanceof Error ? validationError.message : 'No se pudo validar la dirección.',
        variant: 'destructive',
      });
    }
  };

  const renderOrderRow = (
    order: Order,
    opts?: { showCsvLine?: boolean; showWhatsapp?: boolean; showShippingDetails?: boolean },
  ) => {
    const item = getRepresentativeItem(order);
    const availablePreview =
      item?.files?.baseUrl || item?.files?.vectorPreviewUrl || item?.files?.vectorUrl;
    const isSucursal = order.shipping.service === 'SUCURSAL';
    const isDomicilio = order.shipping.service === 'DOMICILIO';
    const hasShippingTypeSelected = isSucursal || isDomicilio;
    const shippingState = order.items[0]?.shippingState;
    const shippingChipVisual = getShippingChipVisual(shippingState || 'SIN_ENVIO');
    const uploadInProgress = isMicorreoUploadRunning(order.id);
    const labelError = order.shippingLabelError?.trim();

    const csvLine = opts?.showCsvLine ? csvLineNumberByOrderId.get(order.id) : undefined;
    const phoneDigitsCopiar = normalizePhoneDigits(order.customer.phoneE164 || '');
    const shippingAddress = order.direccionId ? shippingAddressById.get(order.direccionId) : undefined;
    const destRecipientName = shippingAddress
      ? `${shippingAddress.nombre || ''} ${shippingAddress.apellido || ''}`.trim()
      : '';
    const isDuplicateDestName =
      Boolean(destRecipientName) &&
      duplicateDestRecipientNames.has(
        normalizeDestRecipientName(shippingAddress?.nombre || '', shippingAddress?.apellido || ''),
      );
    const designLabel = item ? getOrderItemDisplayName(item) : 'Sin diseño';

    return (
      <ContextMenu key={order.id}>
        <ContextMenuTrigger asChild>
      <tr
        className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${
          isDuplicateDestName ? 'bg-amber-500/15 hover:bg-amber-500/20' : ''
        }`}
      >
        {opts?.showCsvLine ? (
          <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
            {csvLine !== undefined ? csvLine : '—'}
          </td>
        ) : null}
        <td className="px-4 py-3">{formatDate(order.orderDate)}</td>
        <td className="px-4 py-3 font-medium">
          {`${order.customer.firstName} ${order.customer.lastName}`.trim()}
        </td>
        {opts?.showWhatsapp ? (
          <td className="px-2 py-3 text-center align-middle">
            <button
              type="button"
              title={phoneDigitsCopiar ? 'Copiar número al portapapeles' : 'Sin teléfono en la orden'}
              disabled={!phoneDigitsCopiar}
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(phoneDigitsCopiar).then(
                  () => {
                    toast({
                      title: 'Teléfono copiado',
                      description: phoneDigitsCopiar,
                    });
                  },
                  () => {
                    toast({
                      title: 'No se pudo copiar',
                      description: 'Permisos del portapapeles o HTTPS requerido.',
                      variant: 'destructive',
                    });
                  },
                );
              }}
              className={`inline-flex size-9 items-center justify-center rounded-full border transition-colors ${
                phoneDigitsCopiar
                  ? 'border-green-600/35 bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:border-green-400/35 dark:text-green-400'
                  : 'cursor-not-allowed border-muted text-muted-foreground opacity-40'
              }`}
            >
              <WhatsappLogo className="size-5" />
            </button>
          </td>
        ) : null}
        <td className="px-4 py-3">{order.items.length}</td>
        <td className="px-4 py-3">{designLabel}</td>
        <td className="px-4 py-3">
          {availablePreview ? (
            <img
              src={availablePreview}
              alt="Preview archivo"
              className="h-12 w-12 rounded-md object-contain border bg-white p-1 cursor-zoom-in"
              onClick={() => setPreviewImageUrl(availablePreview)}
            />
          ) : (
            <Badge variant="secondary">Sin preview</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isDomicilio ? 'default' : 'outline'}
                onClick={() => handleToggleShippingType(order, 'DOMICILIO')}
              >
                Domicilio
              </Button>
              <Button
                size="sm"
                variant={isSucursal ? 'default' : 'outline'}
                onClick={() => handleToggleShippingType(order, 'SUCURSAL')}
              >
                Sucursal
              </Button>
            </div>
            <Select
              value={shippingState || 'SIN_ENVIO'}
              onValueChange={(value) => handleShippingStateChange(order, value as ShippingState)}
            >
              <SelectTrigger className="h-auto w-auto min-w-[132px] border-none bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0">
                <SelectValue>
                  <span
                    className={`inline-flex shrink-0 items-center justify-center rounded-full border px-3 py-1 text-xs ${shippingChipVisual.textClass}`}
                    style={{
                      backgroundImage: shippingChipVisual.backgroundImage,
                      backgroundColor: shippingChipVisual.backgroundColor,
                      boxShadow: shippingChipVisual.boxShadow,
                      borderColor: shippingChipVisual.borderColor,
                      backdropFilter: 'saturate(140%) blur(3px)',
                      color: shippingChipVisual.textColor,
                      minWidth: shippingChipVisual.width,
                    }}
                  >
                    {getShippingLabel(shippingState || 'SIN_ENVIO')}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {shippingStateOptions.map((stateOption) => {
                  const optionVisual = getShippingChipVisual(stateOption);
                  return (
                    <SelectItem key={stateOption} value={stateOption} className="text-xs">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${optionVisual.textClass}`}
                        style={{
                          backgroundImage: optionVisual.backgroundImage,
                          backgroundColor: optionVisual.backgroundColor,
                          boxShadow: optionVisual.boxShadow,
                          borderColor: optionVisual.borderColor,
                          backdropFilter: 'saturate(140%) blur(3px)',
                          color: optionVisual.textColor,
                          minWidth: optionVisual.width,
                        }}
                      >
                        {getShippingLabel(stateOption)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {uploadInProgress ? (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin text-orange-500"
                aria-label="Subiendo a MiCorreo"
              />
            ) : null}
            {shippingState === 'ERROR_ETIQUETA' ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-red-500/45 bg-red-500/15 text-red-600 dark:text-red-400"
                      aria-label="Ver error de etiqueta"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap">
                    {labelError || 'Error al subir la etiqueta. Editá los datos y confirmá de nuevo.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </td>
        {opts?.showShippingDetails ? (
          <>
            <td className="px-4 py-3 text-muted-foreground">
              {order.shippingDataLoadedBy?.name || '—'}
            </td>
            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
              {order.shippingDataLoadedAt
                ? formatDateTime(order.shippingDataLoadedAt)
                : shippingAddress?.created_at
                  ? formatDateTime(shippingAddress.created_at)
                  : '—'}
            </td>
            <td className="px-4 py-3">
              {order.shippingDataEdited ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                  Sí
                </Badge>
              ) : (
                <span className="text-muted-foreground">No</span>
              )}
            </td>
            <td className="px-4 py-3 font-medium">{destRecipientName || '—'}</td>
            <td className="px-4 py-3 max-w-[220px] truncate" title={formatShippingDestination(order, shippingAddress)}>
              {formatShippingDestination(order, shippingAddress)}
            </td>
          </>
        ) : null}
        <td className="px-4 py-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openShippingDialog(order)}
            disabled={!hasShippingTypeSelected}
            title={!hasShippingTypeSelected ? 'Seleccioná Domicilio o Sucursal primero' : undefined}
          >
            {order.direccionId ? 'Editar datos' : 'Cargar datos'}
          </Button>
        </td>
      </tr>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!order.direccionId}
            onSelect={() => {
              void handleClearShippingData(order);
            }}
          >
            Quitar datos de envío
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const tableClass = 'w-full text-sm';

  const tableHead = (
    showCsvLine: boolean,
    opts?: { showWhatsapp?: boolean; showShippingDetails?: boolean },
  ) => (
    <thead className="sticky top-0 bg-background z-10 border-b">
      <tr className="text-left text-muted-foreground">
        {showCsvLine ? (
          <th className="px-3 py-3 font-medium w-14 text-center" title="Número de fila en el CSV (la 1 es el encabezado)">
            CSV
          </th>
        ) : null}
        <th className="px-4 py-3 font-medium">Fecha</th>
        <th className="px-4 py-3 font-medium">Cliente</th>
        {opts?.showWhatsapp ? (
          <th className="px-2 py-3 font-medium text-center w-14" title="Copiar número de WhatsApp">
            WA
          </th>
        ) : null}
        <th className="px-4 py-3 font-medium">Items</th>
        <th className="px-4 py-3 font-medium">Diseño</th>
        <th className="px-4 py-3 font-medium">Archivo</th>
        <th className="px-4 py-3 font-medium">Tipo envío</th>
        {opts?.showShippingDetails ? (
          <>
            <th className="px-4 py-3 font-medium">Cargado por</th>
            <th className="px-4 py-3 font-medium">Fecha carga</th>
            <th className="px-4 py-3 font-medium">Editado</th>
            <th className="px-4 py-3 font-medium">Destinatario</th>
            <th className="px-4 py-3 font-medium">Dir / Suc</th>
          </>
        ) : null}
        <th className="px-4 py-3 font-medium">Acciones</th>
      </tr>
    </thead>
  );

  return (
    <AppMain className="flex flex-col">
        <div className="border-b bg-background p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Envíos</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Al confirmar datos se sube a MiCorreo automáticamente. El CSV manual incluye solo pedidos en Hacer Etiqueta.
              </p>
            </div>
            <Button
              onClick={handleGenerateCsv}
              disabled={!csvOrders.length || isGeneratingCsv}
              title={
                csvOrders.length
                  ? 'Descarga CSV para carga manual en MiCorreo (solo Hacer Etiqueta)'
                  : 'No hay pedidos en Hacer Etiqueta para exportar'
              }
            >
              {isGeneratingCsv ? 'Generando CSV...' : `Generar CSV (${csvOrders.length})`}
            </Button>
            {micorreoUploadBusy ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {micorreoQueueSize > 1
                  ? `MiCorreo: cola (${micorreoQueueSize} pendientes)…`
                  : 'Subiendo a MiCorreo…'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Cargando órdenes...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Error: {error.message}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 min-h-0 flex flex-col flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConDatosExpanded((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-foreground"
                  >
                    {isConDatosExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Con datos de envío (listos para etiqueta / CSV)
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!ordersConDatosEnvio.length || isBulkResettingEnvio}
                      onClick={() => void handleBulkResetSinEnvioConDatos()}
                    >
                      {isBulkResettingEnvio ? 'Aplicando…' : 'Todos → Sin envío'}
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">{ordersConDatosEnvio.length}</span>
                  </div>
                </div>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex-1 min-h-[120px]">
                  {isConDatosExpanded ? (
                    <div className="overflow-auto max-h-[min(50vh,420px)]">
                      <table className={tableClass}>
                        {tableHead(true, { showShippingDetails: true })}
                        <tbody>
                          {ordersConDatosEnvio.map((o) =>
                            renderOrderRow(o, { showCsvLine: true, showShippingDetails: true }),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {!ordersConDatosEnvio.length ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border-t">
                      {eligibleOrders.length
                        ? 'Ningún pedido con datos de envío aún. Usá «Cargar datos» en la tabla de abajo.'
                        : 'No hay pedidos en esta lista.'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 min-h-0 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPendientesExpanded((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-foreground"
                  >
                    {isPendientesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Pendientes de cargar datos de envío
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">{ordersPendientesDatos.length}</span>
                </div>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex-1 min-h-[120px]">
                  {isPendientesExpanded ? (
                    <div className="overflow-auto max-h-[min(50vh,420px)]">
                      <table className={tableClass}>
                        {tableHead(false, { showWhatsapp: true })}
        <tbody>{ordersPendientesDatos.map((o) => renderOrderRow(o, { showWhatsapp: true }))}</tbody>
                      </table>
                    </div>
                  ) : null}
                  {!ordersPendientesDatos.length && eligibleOrders.length > 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border-t">
                      No hay pedidos pendientes con venta en Foto enviada o Transferido.
                    </div>
                  ) : null}
                  {!eligibleOrders.length ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border-t">
                      No hay órdenes con fabricación lista y filtro de envío aplicable.
                    </div>
                  ) : null}
                </div>
              </div>

              {lastCsvSkipped.length > 0 ? (
                <div className="rounded-xl border bg-card p-4 bg-muted/20">
                  <p className="text-sm font-medium mb-2">Órdenes excluidas del último CSV</p>
                  <ul className="space-y-1 text-sm text-muted-foreground max-h-40 overflow-auto">
                    {lastCsvSkipped.map((entry) => (
                      <li key={entry.orderId}>
                        {entry.orderId}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && closeShippingDialog()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cargar datos de envío</DialogTitle>
            <DialogDescription>
              Pegá el mensaje del cliente, revisá el parseo y confirmá antes de guardar.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="raw-shipping-text">Texto del cliente</Label>
              <Textarea
                id="raw-shipping-text"
                value={rawShippingText}
                onChange={(event) => setRawShippingText(event.target.value)}
                placeholder="Pegá acá los datos de envío..."
                className="min-h-[240px]"
              />
              <Button variant="outline" onClick={handleParse} disabled={isParsingWithAi}>
                {isParsingWithAi ? 'Interpretando...' : 'Interpretar texto'}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={shippingTypeDraft === 'DOMICILIO' ? 'default' : 'outline'}
                  onClick={() => {
                    setShippingTypeDraft('DOMICILIO');
                    setManualSucursalCode('');
                  }}
                >
                  Domicilio
                </Button>
                <Button
                  variant={shippingTypeDraft === 'SUCURSAL' ? 'default' : 'outline'}
                  onClick={() => {
                    if (shippingTypeDraft === 'DOMICILIO') {
                      setShippingForm((prev) => ({
                        ...prev,
                        postalCode: '',
                        province: '',
                        locality: '',
                        address: '',
                      }));
                    } else {
                      setShippingForm((prev) => ({ ...prev, postalCode: '' }));
                    }
                    setShippingTypeDraft('SUCURSAL');
                  }}
                >
                  Sucursal
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  value={shippingForm.fullName}
                  onChange={(event) => setShippingForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  onBlur={(event) =>
                    setShippingForm((prev) => ({ ...prev, fullName: stripAccents(event.target.value.trim()) }))
                  }
                />
              </div>
              {shippingTypeDraft === 'DOMICILIO' ? (
                <>
                  {isLoadingAddressCatalog ? (
                    <p className="text-xs text-muted-foreground">Cargando padrón de provincias…</p>
                  ) : null}
                  {!isLoadingAddressCatalog && !hasAddressCatalog ? (
                    <p className="text-xs text-muted-foreground">
                      Sin padrón en correo_sucursales. No se puede elegir provincia hasta cargar la tabla.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Provincia</Label>
                    <Select
                      disabled={isLoadingAddressCatalog || !hasAddressCatalog}
                      value={shippingForm.province.trim() ? shippingForm.province : SELECT_EMPTY_VALUE}
                      onValueChange={(newProvince) => {
                        if (newProvince === SELECT_EMPTY_VALUE) {
                          setShippingForm((prev) => ({ ...prev, province: '' }));
                          return;
                        }
                        setShippingForm((prev) => ({
                          ...prev,
                          province: newProvince,
                          locality: normalizeLocalityForCorreo(
                            canonicalizeProvince(newProvince) || newProvince,
                            prev.locality,
                          ),
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Provincia (padrón Correo)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,320px)]">
                        <SelectItem value={SELECT_EMPTY_VALUE}>(vacío)</SelectItem>
                        {provinceSelectOptions.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Localidad</Label>
                    <Input
                      value={shippingForm.locality}
                      onChange={(event) =>
                        setShippingForm((prev) => ({
                          ...prev,
                          locality: normalizeLocalityWhileTyping(event.target.value),
                        }))
                      }
                      onBlur={(event) =>
                        setShippingForm((prev) => ({
                          ...prev,
                          locality: normalizeLocalityForCorreo(
                            canonicalizeProvince(prev.province) || prev.province,
                            event.target.value,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Domicilio (calle y número)</Label>
                    <Input
                      value={shippingForm.address}
                      onChange={(event) => setShippingForm((prev) => ({ ...prev, address: event.target.value }))}
                      onBlur={(event) =>
                        setShippingForm((prev) => ({ ...prev, address: stripAccents(event.target.value.trim()) }))
                      }
                      placeholder="Calle, número, piso…"
                    />
                  </div>
                </>
              ) : (
                <>
                  {isLoadingAddressCatalog ? (
                    <p className="text-xs text-muted-foreground">Cargando padrón…</p>
                  ) : null}
                  {!isLoadingAddressCatalog && !hasAddressCatalog ? (
                    <p className="text-xs text-muted-foreground">Sin padrón en correo_sucursales. Usá código manual.</p>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Provincia</Label>
                    <Select
                      disabled={isLoadingAddressCatalog || !hasAddressCatalog}
                      value={shippingForm.province.trim() ? shippingForm.province : SELECT_EMPTY_VALUE}
                      onValueChange={(newProvince) => {
                        if (newProvince === SELECT_EMPTY_VALUE) {
                          setShippingForm((prev) => ({
                            ...prev,
                            province: '',
                            locality: '',
                            address: '',
                            postalCode: '',
                          }));
                          return;
                        }
                        setShippingForm((prev) => {
                          const pCanon = canonicalizeProvince(newProvince) || newProvince.trim();
                          const locOpts = catalogLocalityOptions(addressCatalogRows, pCanon);
                          const newLoc = locOpts[0] ?? '';
                          const addrOpts = newLoc
                            ? catalogAddressOptions(addressCatalogRows, pCanon, newLoc)
                            : [];
                          const newAddr = addrOpts[0] ?? '';
                          const cp = findPostalCodeInCatalog(
                            addressCatalogRows,
                            pCanon,
                            newLoc,
                            newAddr,
                          );
                          return {
                            ...prev,
                            province: newProvince,
                            locality: newLoc,
                            address: newAddr,
                            postalCode: cp ?? '',
                          };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Provincia" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,320px)]">
                        <SelectItem value={SELECT_EMPTY_VALUE}>(vacío)</SelectItem>
                        {provinceSelectOptions.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Localidad</Label>
                    <Select
                      disabled={isLoadingAddressCatalog || !hasAddressCatalog}
                      value={shippingForm.locality.trim() ? shippingForm.locality : SELECT_EMPTY_VALUE}
                      onValueChange={(newLoc) => {
                        if (newLoc === SELECT_EMPTY_VALUE) {
                          setShippingForm((prev) => ({ ...prev, locality: '', address: '', postalCode: '' }));
                          return;
                        }
                        setShippingForm((prev) => {
                          const pCanon = canonicalizeProvince(prev.province) || prev.province.trim();
                          const addrOpts = catalogAddressOptions(addressCatalogRows, pCanon, newLoc);
                          const newAddr = addrOpts[0] ?? '';
                          const cp = findPostalCodeInCatalog(
                            addressCatalogRows,
                            pCanon,
                            newLoc,
                            newAddr,
                          );
                          return {
                            ...prev,
                            locality: newLoc,
                            address: newAddr,
                            postalCode: cp ?? '',
                          };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Localidad" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,320px)]">
                        <SelectItem value={SELECT_EMPTY_VALUE}>(vacío)</SelectItem>
                        {localitySelectOptions.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Dirección de la sucursal</Label>
                    <Select
                      disabled={isLoadingAddressCatalog || !hasAddressCatalog}
                      value={
                        shippingForm.address.trim()
                          ? manualSucursalCode.trim()
                            ? `${shippingForm.address.trim()}||${manualSucursalCode.trim()}`
                            : shippingForm.address.trim()
                          : SELECT_EMPTY_VALUE
                      }
                      onValueChange={(newAddr) => {
                        if (newAddr === SELECT_EMPTY_VALUE) {
                          setManualSucursalCode('');
                          setShippingForm((prev) => ({ ...prev, address: '', postalCode: '' }));
                          return;
                        }
                        const parts = newAddr.split('||');
                        const domicilio = (parts[0] || '').trim();
                        const codigo = (parts[1] || '').trim();
                        if (codigo) setManualSucursalCode(codigo);

                        setShippingForm((prev) => {
                          const pCanon = canonicalizeProvince(prev.province) || prev.province.trim();
                          const loc =
                            pCanon === 'Capital Federal'
                              ? catalogLocalityOptions(addressCatalogRows, pCanon)[0] || prev.locality.trim()
                              : prev.locality.trim();
                          const cp = findPostalCodeInCatalog(addressCatalogRows, pCanon, loc, domicilio);
                          return {
                            ...prev,
                            address: domicilio,
                            postalCode: cp ?? prev.postalCode,
                          };
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Calle y número (padrón)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(60vh,360px)]">
                        <SelectItem value={SELECT_EMPTY_VALUE}>(vacío)</SelectItem>
                        {sucursalAddressOptionsWithCode.length > 0
                          ? sucursalAddressOptionsWithCode.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="whitespace-normal">
                                {opt.domicilio}
                              </SelectItem>
                            ))
                          : addressSelectOptions.map((addr) => (
                              <SelectItem key={addr} value={addr} className="whitespace-normal">
                                {addr}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {shippingTypeDraft === 'SUCURSAL' ? (
                <div className="space-y-2">
                  <Label htmlFor="manual-sucursal-code">Código de sucursal (manual)</Label>
                  <Input
                    id="manual-sucursal-code"
                    value={manualSucursalCode}
                    onChange={(event) => setManualSucursalCode(event.target.value)}
                    placeholder="Código MiCorreo (opcional)"
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <div className={shippingTypeDraft === 'SUCURSAL' ? 'space-y-2' : 'grid grid-cols-2 gap-2'}>
                {shippingTypeDraft === 'DOMICILIO' ? (
                  <div className="space-y-2">
                    <Label>Código postal</Label>
                    <Input
                      value={shippingForm.postalCode}
                      onChange={(event) => setShippingForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={shippingForm.phone}
                    onChange={(event) =>
                      setShippingForm((prev) => ({
                        ...prev,
                        phone: normalizePhoneDigitsForEnvios(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={shippingForm.email}
                  onChange={(event) => setShippingForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
            </div>
          </div>

          {showParseConfirmation ? (
            <div className="rounded-md border p-3 bg-muted/30 text-sm">
              Confirmación final: se guardará la dirección, la venta pasará a Transferido si corresponde, y la
              etiqueta se subirá a MiCorreo en segundo plano.
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeShippingDialog}>
              Cancelar
            </Button>
            {!showParseConfirmation ? (
              <Button onClick={handleContinueToConfirmation} disabled={isLoadingExistingShippingData}>
                Continuar con confirmación
              </Button>
            ) : (
              <Button onClick={handleSaveShippingData} disabled={isSavingShippingData}>
                {isSavingShippingData ? 'Guardando...' : 'Confirmar y subir etiqueta'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Vista previa del archivo</DialogTitle>
          </DialogHeader>
          {previewImageUrl ? (
            <div className="w-full max-h-[70vh] overflow-auto rounded-md border bg-white p-4">
              <img
                src={previewImageUrl}
                alt="Preview ampliado"
                className="mx-auto h-auto max-h-[65vh] w-auto object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Toaster />
    </AppMain>
  );
}
