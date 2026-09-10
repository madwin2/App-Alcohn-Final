import { PDFDocument } from 'pdf-lib';
import { supabase } from '../client';
import type { Order } from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { enrichAndreaniLabelsPdf } from '@/lib/utils/enrichAndreaniLabelsPdf';
import { parseAndreaniLabelPages } from '@/lib/utils/andreaniTrackingPdfParser';

export type AndreaniEtiquetaEstado = 'asignada' | 'huerfano' | 'erronea';

export interface AndreaniEtiquetaRow {
  id: string;
  tracking: string;
  nroOperacion: string | null;
  destinatario: string | null;
  destino: string | null;
  fechaPortal: string | null;
  estadoPortal: string | null;
  ordenId: string | null;
  estado: AndreaniEtiquetaEstado;
  pdfPath: string | null;
  nota: string | null;
  creadoEn: string;
  asignadoEn: string | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  disenoNombre: string | null;
  saleTransferred: boolean;
  estadoEnvio: string | null;
}

const MM_TO_PT = 72 / 25.4;
const LABEL_W_PT = 100 * MM_TO_PT;
const LABEL_H_PT = 152 * MM_TO_PT;

type ClienteJoin = {
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
} | null;

const mapListRow = (row: {
  id: string;
  tracking: string;
  nro_operacion: string | null;
  destinatario: string | null;
  destino: string | null;
  fecha_portal: string | null;
  estado_portal: string | null;
  orden_id: string | null;
  estado: string;
  pdf_path: string | null;
  nota: string | null;
  creado_en: string;
  asignado_en: string | null;
  ordenes:
    | {
        estado_orden: string | null;
        estado_envio: string | null;
        clientes: ClienteJoin | ClienteJoin[] | null;
        sellos:
          | {
              diseno: string | null;
              estado_venta: string | null;
              item_type: string | null;
              item_config: Record<string, unknown> | null;
            }[]
          | null;
      }
    | {
        estado_orden: string | null;
        estado_envio: string | null;
        clientes: ClienteJoin | ClienteJoin[] | null;
        sellos:
          | {
              diseno: string | null;
              estado_venta: string | null;
              item_type: string | null;
              item_config: Record<string, unknown> | null;
            }[]
          | null;
      }[]
    | null;
}): AndreaniEtiquetaRow => {
  const ordenRaw = row.ordenes;
  const orden = Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw;
  const clienteRaw = orden?.clientes;
  const cliente = Array.isArray(clienteRaw) ? clienteRaw[0] : clienteRaw;
  const sellos = orden?.sellos ?? [];
  const allTransferred =
    sellos.length > 0
      ? sellos.every((s) => s.estado_venta === 'Transferido')
      : orden?.estado_orden === 'Transferido';
  const designNames = sellos
    .map((s) =>
      getOrderItemDisplayName({
        designName: s.diseno || '',
        itemType: (s.item_type as Order['items'][number]['itemType']) || 'SELLO',
        itemConfig: s.item_config as Order['items'][number]['itemConfig'],
      }),
    )
    .filter((name) => Boolean(name));
  const disenoNombre =
    designNames.length === 0 ? null : designNames.length === 1 ? designNames[0] : designNames.join(', ');

  return {
    id: row.id,
    tracking: row.tracking,
    nroOperacion: row.nro_operacion,
    destinatario: row.destinatario,
    destino: row.destino,
    fechaPortal: row.fecha_portal,
    estadoPortal: row.estado_portal,
    ordenId: row.orden_id,
    estado: row.estado as AndreaniEtiquetaEstado,
    pdfPath: row.pdf_path,
    nota: row.nota,
    creadoEn: row.creado_en,
    asignadoEn: row.asignado_en,
    clienteNombre: cliente ? `${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`.trim() || null : null,
    clienteTelefono: cliente?.telefono?.trim() || null,
    disenoNombre,
    saleTransferred: Boolean(allTransferred),
    estadoEnvio: orden?.estado_envio ?? null,
  };
};

const ETIQUETA_LIST_SELECT = `
      id, tracking, nro_operacion, destinatario, destino, fecha_portal, estado_portal,
      orden_id, estado, pdf_path, nota, creado_en, asignado_en,
      ordenes (
        estado_orden,
        estado_envio,
        clientes ( nombre, apellido, telefono ),
        sellos ( diseno, estado_venta, item_type, item_config )
      )
    `;

export const listAndreaniEtiquetas = async (): Promise<AndreaniEtiquetaRow[]> => {
  const [activeRes, erroneasRes] = await Promise.all([
    supabase
      .from('envios_andreani_etiquetas')
      .select(ETIQUETA_LIST_SELECT)
      .in('estado', ['asignada', 'huerfano'])
      .order('creado_en', { ascending: false })
      .limit(300),
    supabase
      .from('envios_andreani_etiquetas')
      .select(ETIQUETA_LIST_SELECT)
      .eq('estado', 'erronea')
      .order('creado_en', { ascending: false })
      .limit(500),
  ]);
  if (activeRes.error) throw activeRes.error;
  if (erroneasRes.error) throw erroneasRes.error;
  return [...(activeRes.data ?? []), ...(erroneasRes.data ?? [])].map((row: Parameters<typeof mapListRow>[0]) =>
    mapListRow(row),
  );
};

export const assignAndreaniEtiquetaToOrder = async (etiquetaId: string, ordenId: string): Promise<void> => {
  const { error } = await supabase.rpc('asignar_etiqueta_andreani', {
    p_etiqueta_id: etiquetaId,
    p_orden_id: ordenId,
  });
  if (error) throw error;
};

/** Mueve un huérfano a errónea (PDF se conserva, deja de aparecer en Huérfanos). */
export const marcarAndreaniEtiquetaErronea = async (etiquetaId: string): Promise<void> => {
  const { error } = await supabase.rpc('marcar_etiqueta_andreani_erronea', {
    p_etiqueta_id: etiquetaId,
  });
  if (error) throw error;
};

/** Devuelve una errónea a huérfano. */
export const restaurarAndreaniEtiquetaHuerfano = async (etiquetaId: string): Promise<void> => {
  const { error } = await supabase.rpc('restaurar_etiqueta_andreani_huerfano', {
    p_etiqueta_id: etiquetaId,
  });
  if (error) throw error;
};

export type AndreaniPedidoTrasLiberar = 'sin_envio' | 'seguimiento_enviado';

export type LiberarEliminarEtiquetaOptions = {
  /** Qué hacer con el pedido si la etiqueta estaba asignada. */
  pedidoAccion?: AndreaniPedidoTrasLiberar;
  /** Seguimiento manual (solo con seguimiento_enviado). Vacío = sin número. */
  seguimiento?: string | null;
};

const removeEtiquetaPdfFromStorage = async (pdfPath: string | null | undefined): Promise<void> => {
  if (!pdfPath) return;
  const { error } = await supabase.storage.from('etiquetas-andreani').remove([pdfPath]);
  if (error) {
    console.warn('No se pudo borrar PDF de storage:', error.message);
  }
};

/** Quita la etiqueta del pedido y la deja huérfana (PDF se conserva). */
export const liberarAndreaniEtiqueta = async (
  etiquetaId: string,
  options?: LiberarEliminarEtiquetaOptions,
): Promise<void> => {
  const { error } = await supabase.rpc('liberar_etiqueta_andreani', {
    p_etiqueta_id: etiquetaId,
    p_pedido_accion: options?.pedidoAccion ?? 'sin_envio',
    p_seguimiento: options?.seguimiento?.trim() || null,
  });
  if (error) throw error;
};

/** Elimina la etiqueta (fila + PDF). Si estaba asignada, aplica destino del pedido. */
export const deleteAndreaniEtiqueta = async (
  etiquetaId: string,
  options?: LiberarEliminarEtiquetaOptions,
): Promise<void> => {
  const { data: pdfPath, error } = await supabase.rpc('eliminar_etiqueta_andreani', {
    p_etiqueta_id: etiquetaId,
    p_pedido_accion: options?.pedidoAccion ?? 'sin_envio',
    p_seguimiento: options?.seguimiento?.trim() || null,
  });
  if (error) throw error;
  await removeEtiquetaPdfFromStorage(typeof pdfPath === 'string' ? pdfPath : null);
};

const fetchAndreaniEtiquetaPdfBytes = async (pdfPath: string): Promise<Uint8Array> => {
  const { data, error } = await supabase.storage.from('etiquetas-andreani').createSignedUrl(pdfPath, 120);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo firmar el PDF');
  }
  const res = await fetch(data.signedUrl);
  if (!res.ok) {
    throw new Error(`No se pudo descargar el PDF (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
};

const triggerBrowserDownload = (href: string, filename: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
};

export const downloadAndreaniEtiquetaPdf = async (
  pdfPath: string,
  options?: { tracking?: string; order?: Order | null },
): Promise<void> => {
  const bytes = await fetchAndreaniEtiquetaPdfBytes(pdfPath);
  let out: Uint8Array = bytes;
  if (options?.tracking && options.order) {
    const map = new Map<string, Order>([[options.tracking, options.order]]);
    const copy = new Uint8Array(bytes);
    out = await enrichAndreaniLabelsPdf(copy.buffer, map);
  }
  const blob = new Blob([out as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, pdfPath.split('/').pop() || 'etiqueta-andreani.pdf');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export type AndreaniDownloadItem = {
  pdfPath: string;
  tracking: string;
  order?: Order | null;
};

/** Une varios PDFs en uno solo, re-enriqueciendo el pie con ítems del pedido (accesorios, multi-sello). */
export const downloadMergedAndreaniEtiquetasPdfs = async (
  items: AndreaniDownloadItem[] | string[],
): Promise<void> => {
  const normalized: AndreaniDownloadItem[] = items.map((item) =>
    typeof item === 'string' ? { pdfPath: item, tracking: '' } : item,
  );
  if (normalized.length === 0) {
    throw new Error('No hay PDFs para descargar');
  }

  const outDoc = await PDFDocument.create();

  for (const item of normalized) {
    const raw = await fetchAndreaniEtiquetaPdfBytes(item.pdfPath);
    let bytes: Uint8Array = raw;
    if (item.tracking && item.order) {
      const map = new Map<string, Order>([[item.tracking, item.order]]);
      const copy = new Uint8Array(raw);
      bytes = await enrichAndreaniLabelsPdf(copy.buffer, map);
    }
    const src = await PDFDocument.load(bytes);
    const indices = src.getPageIndices();
    const copied = await outDoc.copyPages(src, indices);
    for (const page of copied) {
      // Normalizar a 100×152 si viniera otro tamaño.
      const w = page.getWidth();
      const h = page.getHeight();
      if (Math.abs(w - LABEL_W_PT) > 0.5 || Math.abs(h - LABEL_H_PT) > 0.5) {
        page.setSize(LABEL_W_PT, LABEL_H_PT);
      }
      outDoc.addPage(page);
    }
  }

  const merged = await outDoc.save();
  const blob = new Blob([merged as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(url, `etiquetas-andreani-${stamp}.pdf`);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const andreaniAssignCandidatesFromOrders = (orders: Order[]): Array<{ id: string; label: string }> =>
  orders
    .filter((order) => {
      if (!order.andreaniLinkUrl) return false;
      if (order.shipping?.trackingNumber) return false;
      // Ya cerrados: no ofrecerlos para asignar huérfanos (aunque falte el TN en el pedido).
      if (order.items.some((item) => item.shippingState === 'SEGUIMIENTO_ENVIADO')) return false;
      return true;
    })
    .map((order) => {
      const itemsLabel =
        order.items.length > 0
          ? order.items.map((item) => getOrderItemDisplayName(item)).join(', ')
          : order.id.slice(0, 8);
      return {
        id: order.id,
        label: `${order.customer.firstName} ${order.customer.lastName} · ${itemsLabel}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

export type ManualAndreaniImportResult = {
  imported: number;
  updated: number;
  skipped: Array<{ fileName: string; pageNumber: number; reason: string }>;
};

const uploadEtiquetaPdfBytes = async (tracking: string, bytes: Uint8Array): Promise<string> => {
  const path = `${tracking}.pdf`;
  const { error } = await supabase.storage.from('etiquetas-andreani').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return path;
};

/**
 * Carga manual: PDF(s) bajados del portal Andreani → filas huérfanas asignables.
 * Multi-hoja: una etiqueta por página. Si ya existe el tracking, refresca el PDF.
 */
export const importManualAndreaniEtiquetaPdfs = async (
  files: File[],
  overrides?: Record<string, { tracking: string; destinatario?: string | null }>,
): Promise<ManualAndreaniImportResult> => {
  let imported = 0;
  let updated = 0;
  const skipped: ManualAndreaniImportResult['skipped'] = [];

  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const src = await PDFDocument.load(buffer);
    const pages = await parseAndreaniLabelPages(buffer, file.name);

    for (let i = 0; i < src.getPageCount(); i += 1) {
      const pageNumber = i + 1;
      const parsed = pages[i];
      const overrideKey = `${file.name}::${pageNumber}`;
      const override = overrides?.[overrideKey];
      const tracking = (override?.tracking || parsed?.trackingNumber || '').trim();
      const destinatario =
        (override?.destinatario ?? parsed?.fullName)?.trim() || null;

      if (!tracking || tracking.length < 10) {
        skipped.push({
          fileName: file.name,
          pageNumber,
          reason: 'No se pudo leer el número de seguimiento (indicá el TN a mano)',
        });
        continue;
      }

      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(src, [i]);
      single.addPage(copied);
      const pageBytes = await single.save();

      const pdfPath = await uploadEtiquetaPdfBytes(tracking, pageBytes);

      const { data: existing, error: findError } = await supabase
        .from('envios_andreani_etiquetas')
        .select('id, estado, orden_id')
        .eq('tracking', tracking)
        .maybeSingle();
      if (findError) throw findError;

      if (existing?.id) {
        const patch: Record<string, unknown> = {
          pdf_path: pdfPath,
          estado_portal: 'Pendiente de ingreso',
          nota: 'carga_manual',
        };
        if (destinatario) patch.destinatario = destinatario;
        const { error: updError } = await supabase
          .from('envios_andreani_etiquetas')
          .update(patch)
          .eq('id', existing.id);
        if (updError) throw updError;
        updated += 1;
      } else {
        const { error: insError } = await supabase.from('envios_andreani_etiquetas').insert({
          tracking,
          destinatario,
          destino: null,
          fecha_portal: null,
          estado_portal: 'Pendiente de ingreso',
          orden_id: null,
          estado: 'huerfano',
          pdf_path: pdfPath,
          nota: 'carga_manual',
        });
        if (insError) throw insError;
        imported += 1;
      }
    }
  }

  return { imported, updated, skipped };
};
