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
  saleTransferred: boolean;
}

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
        clientes: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null;
        sellos: { estado_venta: string | null }[] | null;
      }
    | {
        estado_orden: string | null;
        clientes: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null;
        sellos: { estado_venta: string | null }[] | null;
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
        clientes ( nombre, apellido ),
        sellos ( estado_venta )
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

export const downloadAndreaniEtiquetaPdf = async (pdfPath: string): Promise<void> => {
  const { data, error } = await supabase.storage
    .from('etiquetas-andreani')
    .createSignedUrl(pdfPath, 120);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo firmar el PDF');
  }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = pdfPath.split('/').pop() || 'etiqueta-andreani.pdf';
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
};

export const andreaniAssignCandidatesFromOrders = (orders: Order[]): Array<{ id: string; label: string }> =>
  orders
    .filter((order) => Boolean(order.andreaniLinkUrl) && !order.shipping?.trackingNumber)
    .map((order) => ({
      id: order.id,
      label: `${order.customer.firstName} ${order.customer.lastName} · ${order.items[0]?.designName ?? order.id.slice(0, 8)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
