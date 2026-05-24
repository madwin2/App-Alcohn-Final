import { supabase } from '@/lib/supabase/client';
import { mapShippingStateToDB } from '@/lib/supabase/mappers';
import { CSV_FIELDS, createCorreoCsvRow } from '@/lib/utils/correoArgentinoCsv';
import { resolveCorreoCsvPaqueteFromOrderItems } from '@/lib/utils/correoCsvPackageFromOrder';
import { resolveEnvioEmail } from '@/lib/utils/enviosEmail';
import {
  shippingStateFromMicorreoUpload,
  uploadCorreoCsvToWorker,
} from '@/lib/utils/micorreoUpload';
import type { ItemType, StampType } from '@/lib/types';

type BuildCsvResult =
  | { ok: true; csvContent: string; filename: string }
  | { ok: false; reason: string };

type ActivityListener = () => void;

const runningOrderIds = new Set<string>();
const activityListeners = new Set<ActivityListener>();

function notifyActivity() {
  activityListeners.forEach((listener) => listener());
}

export function isMicorreoUploadRunning(orderId?: string): boolean {
  if (orderId) return runningOrderIds.has(orderId);
  return runningOrderIds.size > 0;
}

export function subscribeMicorreoUploadActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

async function persistUploadResult(
  orderId: string,
  shippingState: ReturnType<typeof shippingStateFromMicorreoUpload>,
  message: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('ordenes')
    .update({
      estado_envio: mapShippingStateToDB(shippingState),
      error_etiqueta_mensaje: message,
    } as Record<string, unknown>)
    .eq('id', orderId);

  if (error) {
    console.error('No se pudo persistir resultado MiCorreo:', error);
  }
}

export async function buildCorreoCsvForOrder(orderId: string): Promise<BuildCsvResult> {
  const { data: dbOrder, error: orderError } = await supabase
    .from('ordenes')
    .select('id,direccion_id,cliente_id,tipo_envio')
    .eq('id', orderId)
    .single();

  if (orderError || !dbOrder?.direccion_id) {
    return { ok: false, reason: 'La orden no tiene dirección vinculada.' };
  }

  const [{ data: address, error: addressError }, { data: sellos, error: sellosError }, { data: customer, error: customerError }] =
    await Promise.all([
      supabase
        .from('direcciones')
        .select('provincia,localidad,domicilio,codigo_postal,nombre,apellido,telefono,codigo_sucursal_micorreo')
        .eq('id', dbOrder.direccion_id)
        .single(),
      supabase.from('sellos').select('item_type,tipo').eq('orden_id', orderId),
      supabase.from('clientes').select('mail').eq('id', dbOrder.cliente_id).single(),
    ]);

  if (addressError || !address) {
    return { ok: false, reason: 'No se encontró la dirección de envío.' };
  }
  if (sellosError) {
    return { ok: false, reason: sellosError.message };
  }
  if (customerError) {
    return { ok: false, reason: customerError.message };
  }

  const items = (sellos ?? []).map((sello) => ({
    itemType: (sello.item_type as ItemType | null) ?? undefined,
    stampType: mapDbStampToStampType(sello.tipo),
  }));

  const isSucursal = dbOrder.tipo_envio === 'Sucursal';
  const codigoGuardado = (address.codigo_sucursal_micorreo || '').trim();
  const paquete = resolveCorreoCsvPaqueteFromOrderItems(items);

  const csvRow = await createCorreoCsvRow({
    provincia: address.provincia || '',
    localidad: address.localidad || '',
    domicilio: address.domicilio || '',
    codigoPostal: address.codigo_postal || '',
    nombreCompleto: `${address.nombre || ''} ${address.apellido || ''}`.trim() || 'Sin nombre',
    email: resolveEnvioEmail({ customerEmail: customer?.mail || undefined }),
    telefono: address.telefono || '',
    tipoEnvio: isSucursal ? 'Sucursal' : 'Domicilio',
    codigoSucursalManual: isSucursal && codigoGuardado ? codigoGuardado : undefined,
    paquete,
  });

  if (!csvRow.ok) {
    return { ok: false, reason: csvRow.reason };
  }

  const csvBody = csvRow.row.join(';');
  const csvContent = `${CSV_FIELDS.join(';')}\n${csvBody}`;
  const filename = `carga_correo_${orderId.slice(0, 8)}.csv`;

  return { ok: true, csvContent, filename };
}

function mapDbStampToStampType(tipo: string | null): StampType | undefined {
  switch (tipo) {
    case '3mm':
      return '3MM';
    case 'Alimento':
      return 'ALIMENTO';
    case 'Clasico':
      return 'CLASICO';
    case 'ABC':
      return 'ABC';
    case 'Lacre':
      return 'LACRE';
    default:
      return undefined;
  }
}

async function runMicorreoUpload(orderId: string, onComplete?: () => void): Promise<void> {
  try {
    await persistUploadResult(orderId, 'HACER_ETIQUETA', null);

    const built = await buildCorreoCsvForOrder(orderId);
    if (!built.ok) {
      await persistUploadResult(orderId, 'ERROR_ETIQUETA', built.reason);
      return;
    }

    const uploadResult = await uploadCorreoCsvToWorker({
      csvContent: built.csvContent,
      orderId,
      filename: built.filename,
    });

    const nextState = shippingStateFromMicorreoUpload(uploadResult.status);
    const errorMessage =
      uploadResult.status === 'ok'
        ? null
        : uploadResult.message || 'Error desconocido al subir a MiCorreo.';

    await persistUploadResult(orderId, nextState, errorMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado al subir a MiCorreo.';
    await persistUploadResult(orderId, 'HACER_ETIQUETA', message);
  } finally {
    onComplete?.();
  }
}

/** Dispara la subida a MiCorreo sin bloquear la UI (sigue aunque cambies de pantalla en la misma pestaña). */
export function triggerMicorreoUploadForOrder(orderId: string, onComplete?: () => void): void {
  if (runningOrderIds.has(orderId)) return;

  runningOrderIds.add(orderId);
  notifyActivity();

  void runMicorreoUpload(orderId, () => {
    runningOrderIds.delete(orderId);
    notifyActivity();
    onComplete?.();
  });
}
