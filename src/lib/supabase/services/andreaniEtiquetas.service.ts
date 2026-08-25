import { PDFDocument } from 'pdf-lib';
import { supabase } from '../client';
import type { Order } from '@/lib/types';

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
        clientes: ClienteJoin | ClienteJoin[] | null;
        sellos: { diseno: string | null; estado_venta: string | null }[] | null;
      }
    | {
        estado_orden: string | null;
        clientes: ClienteJoin | ClienteJoin[] | null;
        sellos: { diseno: string | null; estado_venta: string | null }[] | null;
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
  const designNames = sellos.map((s) => s.diseno?.trim()).filter((name): name is string => Boolean(name));
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
        clientes ( nombre, apellido, telefono ),
        sellos ( diseno, estado_venta )
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

/** Une varios PDFs en uno solo, una hoja 100×152 mm por etiqueta. */
export const downloadMergedAndreaniEtiquetasPdfs = async (pdfPaths: string[]): Promise<void> => {
  if (pdfPaths.length === 0) {
    throw new Error('No hay PDFs para descargar');
  }

  const outDoc = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const bytes = await fetchAndreaniEtiquetaPdfBytes(pdfPath);
    const src = await PDFDocument.load(bytes);
    const embeddedPages = await outDoc.embedPages(src.getPages());

    for (const embedded of embeddedPages) {
      const page = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
      const scale = Math.min(LABEL_W_PT / embedded.width, LABEL_H_PT / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawPage(embedded, {
        x: (LABEL_W_PT - w) / 2,
        y: (LABEL_H_PT - h) / 2,
        width: w,
        height: h,
      });
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
    .map((order) => ({
      id: order.id,
      label: `${order.customer.firstName} ${order.customer.lastName} · ${order.items[0]?.designName ?? order.id.slice(0, 8)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
