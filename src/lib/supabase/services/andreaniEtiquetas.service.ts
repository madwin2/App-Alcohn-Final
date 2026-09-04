import { PDFDocument } from 'pdf-lib';
import { supabase } from '../client';
import type { Order } from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';

export type AndreaniEtiquetaEstado = 'asignada' | 'huerfano';

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

export const listAndreaniEtiquetas = async (): Promise<AndreaniEtiquetaRow[]> => {
  const { data, error } = await supabase
    .from('envios_andreani_etiquetas')
    .select(
      `
      id, tracking, nro_operacion, destinatario, destino, fecha_portal, estado_portal,
      orden_id, estado, pdf_path, nota, creado_en, asignado_en,
      ordenes (
        estado_orden,
        estado_envio,
        clientes ( nombre, apellido, telefono ),
        sellos ( diseno, estado_venta, item_type, item_config )
      )
    `,
    )
    .order('creado_en', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((row: Parameters<typeof mapListRow>[0]) => mapListRow(row));
};

export const assignAndreaniEtiquetaToOrder = async (etiquetaId: string, ordenId: string): Promise<void> => {
  const { error } = await supabase.rpc('asignar_etiqueta_andreani', {
    p_etiqueta_id: etiquetaId,
    p_orden_id: ordenId,
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

export const downloadAndreaniEtiquetaPdf = async (pdfPath: string): Promise<void> => {
  const { data, error } = await supabase.storage.from('etiquetas-andreani').createSignedUrl(pdfPath, 120);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo firmar el PDF');
  }
  triggerBrowserDownload(data.signedUrl, pdfPath.split('/').pop() || 'etiqueta-andreani.pdf');
};

/** Une varios PDFs en uno solo, una hoja 100×152 mm por etiqueta (copia directa, sin reescalar). */
export const downloadMergedAndreaniEtiquetasPdfs = async (pdfPaths: string[]): Promise<void> => {
  if (pdfPaths.length === 0) {
    throw new Error('No hay PDFs para descargar');
  }

  const outDoc = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const bytes = await fetchAndreaniEtiquetaPdfBytes(pdfPath);
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
    .filter((order) => Boolean(order.andreaniLinkUrl) && !order.shipping?.trackingNumber)
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
