import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados');
  }
  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function insertDisponibleLinks(urls: string[]): Promise<string[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const supabase = getSupabase();
  const rows = unique.map((url) => ({ url, estado: 'disponible' as const }));
  const { data, error } = await supabase
    .from('envios_andreani_links')
    .insert(rows)
    .select('url');

  if (error) throw error;
  return (data ?? []).map((r) => r.url as string);
}

export async function countDisponibles(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('envios_andreani_links')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'disponible');
  if (error) throw error;
  return count ?? 0;
}

export async function listKnownTrackings(): Promise<Set<string>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('envios_andreani_etiquetas').select('tracking');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.tracking as string).filter(Boolean));
}

/** Trackings en DB pero sin PDF guardado — hay que reintentar descarga. */
export async function listTrackingsMissingPdf(): Promise<Set<string>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('envios_andreani_etiquetas')
    .select('tracking')
    .is('pdf_path', null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.tracking as string).filter(Boolean));
}

export type LabelMatchCandidate = {
  ordenId: string;
  customerName: string;
  shippingName: string | null;
  designNames: string[];
  caption: string;
  imageUrls: string[][];
};

type SelloLite = {
  diseno: string | null;
  archivo_base: string | null;
  archivo_vector_preview: string | null;
  item_type: string | null;
};

function captionFromSellos(sellos: SelloLite[]): string {
  const bits: string[] = [];
  for (const s of sellos) {
    switch (s.item_type) {
      case 'MANGO_GOLPE':
        bits.push('+ mango de golpe');
        break;
      case 'SOLDADOR':
        bits.push('+ soldador');
        break;
      case 'BASE_REMACHADORA':
        bits.push('+ base remachadora');
        break;
      case 'ABECEDARIO':
        bits.push('abecedario');
        break;
      case 'SELLO':
        if (s.diseno?.trim()) bits.push(s.diseno.trim().slice(0, 48));
        break;
      default:
        break;
    }
  }
  return [...new Set(bits)].join(' · ');
}

export async function listAssignedLinkCandidates(): Promise<LabelMatchCandidate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('envios_andreani_links')
    .select(
      `
      orden_id,
      ordenes (
        id,
        seguimiento,
        estado_envio,
        direccion_id,
        clientes ( nombre, apellido ),
        sellos ( diseno, archivo_base, archivo_vector_preview, item_type )
      )
    `,
    )
    .eq('estado', 'asignado');
  if (error) throw error;

  const direccionIds = new Set<string>();
  type OrdenLite = {
    id: string;
    seguimiento: string | null;
    estado_envio: string | null;
    direccion_id: string | null;
    clientes: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null;
    sellos: SelloLite[] | null;
  };

  const ordenes: OrdenLite[] = [];
  for (const row of data ?? []) {
    const ordenRaw = (row as { ordenes?: unknown }).ordenes;
    const orden = (Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw) as OrdenLite | null;
    if (!orden?.id) continue;
    // Ya avisados / cerrados: no volver a matchear etiquetas (aunque seguimiento esté vacío).
    if (orden.estado_envio === 'Seguimiento Enviado') continue;
    if (orden.seguimiento && orden.seguimiento.trim()) continue;
    ordenes.push(orden);
    if (orden.direccion_id) direccionIds.add(orden.direccion_id);
  }

  const addressById = new Map<string, { nombre: string | null; apellido: string | null }>();
  if (direccionIds.size) {
    const { data: dirs, error: dirError } = await supabase
      .from('direcciones')
      .select('id, nombre, apellido')
      .in('id', [...direccionIds]);
    if (dirError) throw dirError;
    for (const d of dirs ?? []) addressById.set(d.id, d);
  }

  const out: LabelMatchCandidate[] = [];
  for (const orden of ordenes) {
    const cliente = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes;
    const dir = orden.direccion_id ? addressById.get(orden.direccion_id) : undefined;
    const sellos = orden.sellos ?? [];
    const imageUrls: string[][] = [];
    for (const s of sellos) {
      const urls = [s.archivo_base, s.archivo_vector_preview].filter(
        (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
      );
      if (urls.length) imageUrls.push(urls);
    }

    out.push({
      ordenId: orden.id,
      customerName: `${cliente?.nombre ?? ''} ${cliente?.apellido ?? ''}`.trim(),
      shippingName: dir ? `${dir.nombre ?? ''} ${dir.apellido ?? ''}`.trim() : null,
      designNames: sellos.map((s) => s.diseno?.trim() || '').filter(Boolean),
      caption: captionFromSellos(sellos),
      imageUrls: imageUrls.slice(0, 3),
    });
  }
  return out;
}

export async function trackingAlreadyStored(tracking: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('envios_andreani_etiquetas')
    .select('id')
    .eq('tracking', tracking)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Datos de pie para re-enriquecer un PDF ya asociado a un pedido. */
export async function loadEnrichInputByTracking(tracking: string): Promise<LabelMatchCandidate | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('envios_andreani_etiquetas')
    .select(
      `
      orden_id,
      ordenes (
        id,
        direccion_id,
        clientes ( nombre, apellido ),
        sellos ( diseno, archivo_base, archivo_vector_preview, item_type )
      )
    `,
    )
    .eq('tracking', tracking)
    .maybeSingle();
  if (error) throw error;
  if (!data?.orden_id) return null;

  type OrdenLite = {
    id: string;
    direccion_id: string | null;
    clientes: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null;
    sellos: SelloLite[] | null;
  };
  const ordenRaw = (data as { ordenes?: unknown }).ordenes;
  const orden = (Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw) as OrdenLite | null;
  if (!orden?.id) return null;

  const cliente = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes;
  const sellos = orden.sellos ?? [];
  const imageUrls: string[][] = [];
  for (const s of sellos) {
    const urls = [s.archivo_base, s.archivo_vector_preview].filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
    );
    if (urls.length) imageUrls.push(urls);
  }

  return {
    ordenId: orden.id,
    customerName: `${cliente?.nombre ?? ''} ${cliente?.apellido ?? ''}`.trim(),
    shippingName: null,
    designNames: sellos.map((s) => s.diseno?.trim() || '').filter(Boolean),
    caption: captionFromSellos(sellos),
    imageUrls: imageUrls.slice(0, 3),
  };
}

export async function uploadEtiquetaPdf(tracking: string, bytes: Uint8Array): Promise<string> {
  const supabase = getSupabase();
  const pathName = `${tracking}.pdf`;
  const { error } = await supabase.storage.from('etiquetas-andreani').upload(pathName, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return pathName;
}

export async function updateEtiquetaPdfPath(tracking: string, pdfPath: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('envios_andreani_etiquetas')
    .update({ pdf_path: pdfPath })
    .eq('tracking', tracking);
  if (error) throw error;
}

export async function insertEtiqueta(row: {
  tracking: string;
  nroOperacion: string | null;
  destinatario: string;
  destino: string;
  fechaPortal: string;
  estadoPortal: string;
  ordenId: string | null;
  estado: 'asignada' | 'huerfano';
  pdfPath: string | null;
  nota: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('envios_andreani_etiquetas').insert({
    tracking: row.tracking,
    nro_operacion: row.nroOperacion,
    destinatario: row.destinatario,
    destino: row.destino,
    fecha_portal: row.fechaPortal,
    estado_portal: row.estadoPortal,
    orden_id: row.ordenId,
    estado: row.estado,
    pdf_path: row.pdfPath,
    nota: row.nota,
    asignado_en: row.ordenId ? new Date().toISOString() : null,
  });
  if (error) throw error;
}

export async function applyTrackingToOrder(ordenId: string, tracking: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('ordenes')
    .update({
      seguimiento: tracking,
      estado_envio: 'Etiqueta Lista',
      empresa_envio: 'Andreani',
    })
    .eq('id', ordenId);
  if (error) throw error;
}

export type TrackingStatusCandidate = {
  tracking: string;
  ordenId: string;
};

/** Etiquetas asignadas: venta Transferido + envío Etiqueta lista (candidatas a pasar a Despachado). */
export async function listTrackingsForStatusRefresh(): Promise<TrackingStatusCandidate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('envios_andreani_etiquetas')
    .select(
      `
      tracking,
      orden_id,
      pdf_path,
      ordenes (
        id,
        estado_envio,
        estado_orden,
        sellos ( estado_venta )
      )
    `,
    )
    .eq('estado', 'asignada')
    .not('orden_id', 'is', null)
    .not('pdf_path', 'is', null);
  if (error) throw error;

  type Row = {
    tracking: string;
    orden_id: string | null;
    pdf_path: string | null;
    ordenes:
      | {
          id: string;
          estado_envio: string | null;
          estado_orden: string | null;
          sellos: { estado_venta: string | null }[] | null;
        }
      | {
          id: string;
          estado_envio: string | null;
          estado_orden: string | null;
          sellos: { estado_venta: string | null }[] | null;
        }[]
      | null;
  };

  const out: TrackingStatusCandidate[] = [];
  for (const row of (data ?? []) as Row[]) {
    if (!row.tracking || !row.orden_id || !row.pdf_path) continue;
    const ordenRaw = row.ordenes;
    const orden = Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw;
    if (!orden?.id) continue;
    if (orden.estado_envio !== 'Etiqueta Lista') continue;

    const sellos = orden.sellos ?? [];
    const saleTransferred =
      sellos.length > 0
        ? sellos.every((s) => s.estado_venta === 'Transferido')
        : orden.estado_orden === 'Transferido';
    if (!saleTransferred) continue;

    out.push({ tracking: row.tracking, ordenId: orden.id });
  }
  return out;
}

export async function updateEtiquetaPortalStatus(
  tracking: string,
  patch: { estadoPortal: string; fechaPortal?: string },
): Promise<void> {
  const supabase = getSupabase();
  const update: Record<string, string> = { estado_portal: patch.estadoPortal };
  if (patch.fechaPortal) update.fecha_portal = patch.fechaPortal;
  const { error } = await supabase.from('envios_andreani_etiquetas').update(update).eq('tracking', tracking);
  if (error) throw error;
}

/** Solo si el envío sigue en Etiqueta lista → Despachado. */
export async function markOrderDespachado(ordenId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error: readErr } = await supabase
    .from('ordenes')
    .select('estado_envio')
    .eq('id', ordenId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (data?.estado_envio !== 'Etiqueta Lista') return false;

  const { error } = await supabase
    .from('ordenes')
    .update({ estado_envio: 'Despachado' })
    .eq('id', ordenId)
    .eq('estado_envio', 'Etiqueta Lista');
  if (error) throw error;
  return true;
}

