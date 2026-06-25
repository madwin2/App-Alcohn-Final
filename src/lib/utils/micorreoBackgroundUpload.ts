import { supabase } from '@/lib/supabase/client';
import { mapShippingStateToDB } from '@/lib/supabase/mappers';
import { CSV_FIELDS, createCorreoCsvRow } from '@/lib/utils/correoArgentinoCsv';
import { resolveCorreoCsvPaqueteFromOrderItems } from '@/lib/utils/correoCsvPackageFromOrder';
import { resolveEnvioEmail } from '@/lib/utils/enviosEmail';
import {
  shippingStateFromMicorreoUpload,
  uploadCorreoCsvToWorker,
} from '@/lib/utils/micorreoUpload';
import type { ItemType, LabelState, StampType } from '@/lib/types';

type BuildCsvResult =
  | { ok: true; csvContent: string; filename: string }
  | { ok: false; reason: string };

type ActivityListener = () => void;

type QueueItem = {
  orderId: string;
  userId?: string | null;
  onComplete?: () => void;
};

const queuedOrderIds = new Set<string>();
const uploadQueue: QueueItem[] = [];
const activityListeners = new Set<ActivityListener>();
let queueProcessorActive = false;

function notifyActivity() {
  activityListeners.forEach((listener) => listener());
}

export function isMicorreoUploadRunning(orderId?: string): boolean {
  if (orderId) return queuedOrderIds.has(orderId);
  return queuedOrderIds.size > 0;
}

/** Subida en curso: cola local (esta pestaña) o flag en Supabase (todas las sesiones). */
export function isOrderMicorreoUploading(
  orderId: string,
  micorreoUploadingAt?: string | null,
): boolean {
  return isMicorreoUploadRunning(orderId) || Boolean(micorreoUploadingAt);
}

/** Órdenes en cola o subiendo ahora (no incluye la que está ejecutando el fetch si ya salió del set). */
export function getMicorreoUploadQueueSize(): number {
  return queuedOrderIds.size;
}

export function subscribeMicorreoUploadActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

async function persistMicorreoUploading(
  orderId: string,
  uploading: boolean,
  userId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('ordenes')
    .update({
      micorreo_subiendo_at: uploading ? new Date().toISOString() : null,
      micorreo_subiendo_por: uploading ? userId ?? null : null,
    } as Record<string, unknown>)
    .eq('id', orderId);

  if (error) {
    console.error('No se pudo actualizar estado de subida MiCorreo:', error);
  }
}

function classifyLabelErrorCode(message: string | null | undefined): string | null {
  const text = (message || '').trim();
  if (!text) return null;
  if (/c[oó]digo postal.*localidad|localidad.*c[oó]digo postal|codpostal.*localidad|cp\b.*localidad/i.test(text)) {
    return 'cp_localidad_invalido';
  }
  if (/sucursal/i.test(text)) return 'sucursal_invalida';
  if (/provincia/i.test(text)) return 'provincia_invalida';
  if (/tel[eé]fono|celular|c[oó]digo de area/i.test(text)) return 'telefono_invalido';
  if (/email|correo electr[oó]nico/i.test(text)) return 'email_invalido';
  if (/saldo|pago|pagar|abonar/i.test(text)) return 'pago_rechazado';
  return null;
}

async function persistLabelState(
  orderId: string,
  labelState: LabelState,
  options?: {
    errorCode?: string | null;
    errorMessage?: string | null;
    generatedAt?: string | null;
    paidAt?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    etiqueta_estado: labelState,
    etiqueta_error_codigo: options?.errorCode ?? null,
    etiqueta_error_mensaje: options?.errorMessage ?? null,
    etiqueta_actualizada_at: now,
  };

  if (options?.generatedAt !== undefined) update.etiqueta_generada_at = options.generatedAt;
  if (options?.paidAt !== undefined) update.etiqueta_pagada_at = options.paidAt;

  const { error } = await supabase.from('ordenes').update(update).eq('id', orderId);
  if (error) {
    console.error('No se pudo persistir estado de etiqueta MiCorreo:', error);
  }
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

async function runMicorreoUpload(orderId: string, userId?: string | null): Promise<void> {
  try {
    await persistMicorreoUploading(orderId, true, userId);
    await persistLabelState(orderId, 'generando', {
      generatedAt: null,
      paidAt: null,
    });
    await persistUploadResult(orderId, 'HACER_ETIQUETA', null);

    const built = await buildCorreoCsvForOrder(orderId);
    if (!built.ok) {
      await persistLabelState(orderId, 'error', {
        errorCode: classifyLabelErrorCode(built.reason) || 'validacion_csv',
        errorMessage: built.reason,
      });
      await persistUploadResult(orderId, 'ERROR_ETIQUETA', built.reason);
      return;
    }

    const uploadResult = await uploadCorreoCsvToWorker({
      csvContent: built.csvContent,
      orderId,
      filename: built.filename,
      payAfterUpload: true,
    });

    const paymentStatus = uploadResult.details?.paymentStatus;
    const nextState =
      uploadResult.status === 'ok' && paymentStatus !== 'paid'
        ? 'HACER_ETIQUETA'
        : shippingStateFromMicorreoUpload(uploadResult.status);
    const errorMessage =
      uploadResult.status === 'ok'
        ? null
        : uploadResult.message || 'Error desconocido al subir a MiCorreo.';

    if (uploadResult.status === 'ok' && paymentStatus === 'paid') {
      const now = new Date().toISOString();
      await persistLabelState(orderId, 'pagada', {
        generatedAt: now,
        paidAt: now,
      });
    } else if (uploadResult.status === 'ok') {
      await persistLabelState(orderId, 'generada', {
        generatedAt: new Date().toISOString(),
        errorMessage: paymentStatus === 'not_attempted' ? 'Etiqueta generada; pago no intentado.' : null,
      });
    } else {
      await persistLabelState(orderId, 'error', {
        errorCode: uploadResult.details?.errorCode || classifyLabelErrorCode(errorMessage) || null,
        errorMessage,
      });
    }

    await persistUploadResult(orderId, nextState, errorMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado al subir a MiCorreo.';
    await persistLabelState(orderId, 'error', {
      errorCode: classifyLabelErrorCode(message) || 'error_sistema',
      errorMessage: message,
    });
    await persistUploadResult(orderId, 'HACER_ETIQUETA', message);
  } finally {
    await persistMicorreoUploading(orderId, false, null);
  }
}

async function processUploadQueue(): Promise<void> {
  if (queueProcessorActive) return;
  queueProcessorActive = true;

  try {
    while (uploadQueue.length > 0) {
      const item = uploadQueue.shift();
      if (!item) break;

      try {
        await runMicorreoUpload(item.orderId, item.userId);
      } finally {
        queuedOrderIds.delete(item.orderId);
        notifyActivity();
        item.onComplete?.();
      }
    }
  } finally {
    queueProcessorActive = false;
    if (uploadQueue.length > 0) {
      void processUploadQueue();
    }
  }
}

/** Encola la subida a MiCorreo (una a la vez por pestaña, con pausa entre jobs). */
export function triggerMicorreoUploadForOrder(
  orderId: string,
  onComplete?: () => void,
  userId?: string | null,
): void {
  if (queuedOrderIds.has(orderId)) return;

  queuedOrderIds.add(orderId);
  uploadQueue.push({ orderId, userId, onComplete });
  notifyActivity();
  void processUploadQueue();
}
