import { useMemo, useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
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
import { useOrders } from '@/lib/hooks/useOrders';
import { formatDate, getShippingChipVisual, getShippingLabel } from '@/lib/utils/format';
import { Order, ShippingState } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { CSV_FIELDS, createCorreoCsvRow } from '@/lib/utils/correoArgentinoCsv';
import { ParsedShippingData, parseShippingText } from '@/lib/utils/parseShippingText';
import { canonicalizeProvince, normalizeLocality, normalizePhoneDigits } from '@/lib/utils/shippingNormalization';

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

const shippingStateOptions: ShippingState[] = [
  'SIN_ENVIO',
  'HACER_ETIQUETA',
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

const normalizeShippingFormData = (data: ShippingFormData): ShippingFormData => ({
  ...data,
  province: canonicalizeProvince(data.province),
  locality: normalizeLocality(data.locality),
  phone: normalizePhoneDigits(data.phone),
});

export default function EnviosPage() {
  const { orders, loading, error, updateOrder, fetchOrders } = useOrders();
  const { toast } = useToast();
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [shippingTypeDraft, setShippingTypeDraft] = useState<'DOMICILIO' | 'SUCURSAL'>('DOMICILIO');
  const [rawShippingText, setRawShippingText] = useState('');
  const [shippingForm, setShippingForm] = useState<ShippingFormData>(emptyForm);
  const [showParseConfirmation, setShowParseConfirmation] = useState(false);
  const [isSavingShippingData, setIsSavingShippingData] = useState(false);
  const [isParsingWithAi, setIsParsingWithAi] = useState(false);
  const [isLoadingExistingShippingData, setIsLoadingExistingShippingData] = useState(false);
  const [lastCsvSkipped, setLastCsvSkipped] = useState<Array<{ orderId: string; reason: string }>>([]);

  const eligibleOrders = useMemo(() => {
    return orders.filter(isEligibleForShipping);
  }, [orders]);

  /** Incluibles al CSV: ya tienen dirección en BD y aún no están en Etiqueta lista */
  const csvOrders = useMemo(() => {
    return eligibleOrders.filter(
      (order) =>
        Boolean(order.direccionId) && order.items[0]?.shippingState !== 'ETIQUETA_LISTA',
    );
  }, [eligibleOrders]);

  const ordersConDatosEnvio = useMemo(
    () => eligibleOrders.filter((order) => Boolean(order.direccionId)),
    [eligibleOrders],
  );
  const ordersPendientesDatos = useMemo(
    () => eligibleOrders.filter((order) => !order.direccionId),
    [eligibleOrders],
  );

  const handleToggleShippingType = async (order: Order, type: 'DOMICILIO' | 'SUCURSAL') => {
    try {
      const tipoEnvioDb = type === 'SUCURSAL' ? 'Sucursal' : 'Domicilio';
      const { error } = await supabase
        .from('ordenes')
        .update({
          empresa_envio: 'Correo Argentino',
          tipo_envio: tipoEnvioDb,
        })
        .eq('id', order.id);
      if (error) throw error;
      await fetchOrders();
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

  const handleShippingStateChange = async (order: Order, newState: ShippingState) => {
    try {
      await updateOrder(order.id, {
        items: order.items.map((item) => ({
          id: item.id,
          shippingState: newState,
        })) as any,
      });

      await fetchOrders();
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
        ? await supabase.from('direcciones').select('id,provincia,localidad,domicilio,codigo_postal,nombre,apellido,telefono')
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
        const csvRow = await createCorreoCsvRow({
          provincia: address.provincia || '',
          localidad: address.localidad || '',
          domicilio: address.domicilio || '',
          codigoPostal: address.codigo_postal || '',
          nombreCompleto: `${address.nombre || order.customer.firstName} ${address.apellido || order.customer.lastName}`,
          email: customerById.get(order.customer.id)?.mail || order.customer.email || '',
          telefono: address.telefono || order.customer.phoneE164 || '',
          tipoEnvio: isSucursal ? 'Sucursal' : 'Domicilio',
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

      // Si una orden no pudo generar etiqueta, queda marcada para rehacerla.
      for (const order of skippedOrders) {
        await updateOrder(order.id, {
          items: order.items.map((item) => ({
            id: item.id,
            shippingState: 'HACER_ETIQUETA',
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
          description: `${primerMotivo}${skipped.length > 1 ? ` (+${skipped.length - 1} más en el listado de abajo)` : ''}`,
          variant: 'destructive',
        });
        return;
      }

      const csvBody = rows.map((row) => row.join(';')).join('\n');
      const csvContent = `${CSV_FIELDS.join(';')}\n${csvBody}`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carga_correo_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      const exportedIdSet = new Set(exportedOrderIdsInOrder);
      const exportedOrders = csvOrders.filter((order) => exportedIdSet.has(order.id));

      for (const order of exportedOrders) {
        await updateOrder(order.id, {
          items: order.items.map((item) => ({
            id: item.id,
            shippingState: 'ETIQUETA_LISTA',
          })) as any,
        });
      }

      await fetchOrders();
      setLastCsvSkipped(skipped);
      toast({
        title: 'CSV generado',
        description:
          skipped.length > 0
            ? `Se exportaron ${exportedOrders.length} órdenes. ${skipped.length} quedaron afuera (ver detalle abajo).`
            : `Se exportaron ${exportedOrders.length} órdenes y se marcaron como Etiqueta Lista.`,
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
    setShippingForm({
      ...emptyForm,
      fullName: `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim(),
      email: order.customer.email || '',
      phone: order.customer.phoneE164 || '',
    });
    setShowParseConfirmation(false);

    if (!order.direccionId) return;

    setIsLoadingExistingShippingData(true);
    try {
      const { data: existingAddress, error: existingAddressError } = await supabase
        .from('direcciones')
        .select('provincia,localidad,domicilio,codigo_postal,nombre,apellido,telefono')
        .eq('id', order.direccionId)
        .single();
      if (existingAddressError) throw existingAddressError;

      const fullName = `${existingAddress?.nombre || order.customer.firstName || ''} ${existingAddress?.apellido || order.customer.lastName || ''}`.trim();
      setShippingForm({
        fullName,
        province: canonicalizeProvince(existingAddress?.provincia || '') || (existingAddress?.provincia || ''),
        locality: normalizeLocality(existingAddress?.localidad || ''),
        address: existingAddress?.domicilio || '',
        postalCode: existingAddress?.codigo_postal || '',
        email: order.customer.email || '',
        phone: normalizePhoneDigits(existingAddress?.telefono || order.customer.phoneE164 || ''),
      });
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
      const parsedData = mergeShippingData(fallbackData, aiData);

      setShippingForm(normalizeShippingFormData(parsedData));
      setShowParseConfirmation(false);
      toast({
        title: 'Parseo IA listo',
        description: 'Se interpretó con IA. Revisá antes de confirmar.',
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
          description: 'La provincia debe ser una de las 24 provincias/Capital Federal (sin abreviaturas).',
          variant: 'destructive',
        });
        return;
      }

      const cleanName = normalizedForm.fullName.trim();
      const nameParts = cleanName.split(' ').filter(Boolean);
      const firstName = nameParts[0] ?? selectedOrder.customer.firstName;
      const lastName = nameParts.slice(1).join(' ') || selectedOrder.customer.lastName || '-';

      const { data: addressRow, error: addressError } = await supabase
        .from('direcciones')
        .insert({
          cliente_id: selectedOrder.customer.id,
          activa: true,
          codigo_postal: normalizedForm.postalCode || '0000',
          provincia: canonicalProvince || 'SIN DEFINIR',
          localidad: normalizeLocality(normalizedForm.locality) || 'SIN DEFINIR',
          domicilio: normalizedForm.address || 'SIN DEFINIR',
          nombre: firstName,
          apellido: lastName,
          telefono: normalizePhoneDigits(normalizedForm.phone) || null,
          dni: null,
        })
        .select('id')
        .single();

      if (addressError) throw addressError;

      const shippingTypeDb = shippingTypeDraft === 'SUCURSAL' ? 'Sucursal' : 'Domicilio';

      const { error: orderError } = await supabase
        .from('ordenes')
        .update({
          direccion_id: addressRow.id,
          tipo_envio: shippingTypeDb,
        })
        .eq('id', selectedOrder.id);

      if (orderError) throw orderError;

      if (normalizedForm.email.trim()) {
        await supabase
          .from('clientes')
          .update({ mail: normalizedForm.email.trim() })
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
      closeShippingDialog();
      toast({
        title: 'Datos de envío guardados',
        description: 'Se guardaron en Supabase y se actualizó el estado de venta cuando correspondía.',
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

  const renderOrderRow = (order: Order) => {
    const item = getRepresentativeItem(order);
    const availablePreview =
      item?.files?.baseUrl || item?.files?.vectorPreviewUrl || item?.files?.vectorUrl;
    const isSucursal = order.shipping.service === 'SUCURSAL';
    const isDomicilio = order.shipping.service === 'DOMICILIO';
    const hasShippingTypeSelected = isSucursal || isDomicilio;
    const shippingState = order.items[0]?.shippingState;
    const shippingChipVisual = getShippingChipVisual(shippingState || 'SIN_ENVIO');

    return (
      <tr key={order.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">{formatDate(order.orderDate)}</td>
        <td className="px-4 py-3 font-medium">
          {`${order.customer.firstName} ${order.customer.lastName}`.trim()}
        </td>
        <td className="px-4 py-3">{order.items.length}</td>
        <td className="px-4 py-3">{item?.designName || 'Sin diseño'}</td>
        <td className="px-4 py-3">
          {availablePreview ? (
            <img
              src={availablePreview}
              alt="Preview archivo"
              className="h-12 w-12 rounded-md object-cover border"
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
          </div>
        </td>
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
    );
  };

  const tableClass = 'w-full text-sm';
  const tableHead = (
    <thead className="sticky top-0 bg-background z-10 border-b">
      <tr className="text-left text-muted-foreground">
        <th className="px-4 py-3 font-medium">Fecha</th>
        <th className="px-4 py-3 font-medium">Cliente</th>
        <th className="px-4 py-3 font-medium">Items</th>
        <th className="px-4 py-3 font-medium">Diseño</th>
        <th className="px-4 py-3 font-medium">Archivo</th>
        <th className="px-4 py-3 font-medium">Tipo envío</th>
        <th className="px-4 py-3 font-medium">Acciones</th>
      </tr>
    </thead>
  );

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col ml-20">
        <div className="border-b bg-background p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Envíos</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Con datos de envío listos para el CSV; abajo, pendientes de carga.
              </p>
            </div>
            <Button onClick={handleGenerateCsv} disabled={!csvOrders.length || isGeneratingCsv}>
              {isGeneratingCsv ? 'Generando CSV...' : `Generar CSV (${csvOrders.length})`}
            </Button>
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
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium text-foreground">Con datos de envío (listos para etiqueta / CSV)</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{ordersConDatosEnvio.length}</span>
                </div>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex-1 min-h-[120px]">
                  <div className="overflow-auto max-h-[min(50vh,420px)]">
                    <table className={tableClass}>
                      {tableHead}
                      <tbody>{ordersConDatosEnvio.map(renderOrderRow)}</tbody>
                    </table>
                  </div>
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
                  <h2 className="text-sm font-medium text-foreground">Pendientes de cargar datos de envío</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{ordersPendientesDatos.length}</span>
                </div>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex-1 min-h-[120px]">
                  <div className="overflow-auto max-h-[min(50vh,420px)]">
                    <table className={tableClass}>
                      {tableHead}
                      <tbody>{ordersPendientesDatos.map(renderOrderRow)}</tbody>
                    </table>
                  </div>
                  {!ordersPendientesDatos.length && eligibleOrders.length > 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground border-t">
                      Todos los pedidos de esta lista ya tienen datos de envío.
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
              {isLoadingExistingShippingData ? (
                <p className="text-xs text-muted-foreground">Cargando datos actuales...</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={shippingTypeDraft === 'DOMICILIO' ? 'default' : 'outline'}
                  onClick={() => setShippingTypeDraft('DOMICILIO')}
                >
                  Domicilio
                </Button>
                <Button
                  variant={shippingTypeDraft === 'SUCURSAL' ? 'default' : 'outline'}
                  onClick={() => setShippingTypeDraft('SUCURSAL')}
                >
                  Sucursal
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  value={shippingForm.fullName}
                  onChange={(event) => setShippingForm((prev) => ({ ...prev, fullName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Provincia</Label>
                <Input
                  value={shippingForm.province}
                  onChange={(event) =>
                    setShippingForm((prev) => ({
                      ...prev,
                      province: canonicalizeProvince(event.target.value) || event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Localidad</Label>
                <Input
                  value={shippingForm.locality}
                  onChange={(event) =>
                    setShippingForm((prev) => ({
                      ...prev,
                      locality: normalizeLocality(event.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {shippingTypeDraft === 'SUCURSAL' ? 'Dirección de la sucursal' : 'Domicilio (calle y número)'}
                </Label>
                <Input
                  value={shippingForm.address}
                  onChange={(event) => setShippingForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder={
                    shippingTypeDraft === 'SUCURSAL'
                      ? 'Calle y número de la oficina (ej. FRANCIA 1670), según el padrón de Correo'
                      : 'Calle, número, piso…'
                  }
                />
                {shippingTypeDraft === 'SUCURSAL' ? (
                  <p className="text-xs text-muted-foreground">
                    Con sucursal usamos calle y número del padrón para asignar el código correcto; en una misma ciudad puede haber varias oficinas.
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Código postal</Label>
                  <Input
                    value={shippingForm.postalCode}
                    onChange={(event) => setShippingForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={shippingForm.phone}
                    onChange={(event) =>
                      setShippingForm((prev) => ({
                        ...prev,
                        phone: normalizePhoneDigits(event.target.value),
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
              Confirmación final: se guardará la dirección en Supabase y la venta pasará a Transferido si corresponde.
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeShippingDialog}>
              Cancelar
            </Button>
            {!showParseConfirmation ? (
              <Button onClick={() => setShowParseConfirmation(true)} disabled={isLoadingExistingShippingData}>
                Continuar con confirmación
              </Button>
            ) : (
              <Button onClick={handleSaveShippingData} disabled={isSavingShippingData}>
                {isSavingShippingData ? 'Guardando...' : 'Confirmar y guardar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
