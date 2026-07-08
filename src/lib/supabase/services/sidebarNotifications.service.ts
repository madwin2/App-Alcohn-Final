import { supabase } from '@/lib/supabase/client';
import { INTERNAL_ORDERS_VISIBILITY_OR } from '@/lib/supabase/services/orders.service';

const PENDIENTE_PAGO_WEB = [
  'pendiente',
  'pago_fallido',
  'esperando_comprobante',
  'abandonado',
] as const;

const COMERCIAL_SEEN_KEY = 'sidebar_comercial_pagos_seen_ids';

function isSelloItemType(itemType: string | null | undefined): boolean {
  return !itemType || itemType === 'SELLO';
}

function hasFile(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.trim().length > 0;
}

/** Cuenta pedidos (últimos `limit`) con algún sello sin base ni vector. */
export async function fetchPedidosMissingFilesBadgeCount(
  limit = 50,
): Promise<number> {
  const { data: ordenes, error } = await supabase
    .from('ordenes')
    .select('id')
    .or(INTERNAL_ORDERS_VISIBILITY_OR)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!ordenes?.length) return 0;

  const ordenIds = ordenes.map((o) => o.id);
  const { data: sellos, error: sellosError } = await supabase
    .from('sellos')
    .select('orden_id, item_type, archivo_base, archivo_vector_preview, estado_fabricacion')
    .in('orden_id', ordenIds);

  if (sellosError) throw new Error(sellosError.message);

  const flagged = new Set<string>();
  for (const sello of sellos ?? []) {
    if (!isSelloItemType(sello.item_type)) continue;
    if (sello.estado_fabricacion === 'Hecho') continue;
    if (hasFile(sello.archivo_base) || hasFile(sello.archivo_vector_preview)) continue;
    flagged.add(sello.orden_id);
  }

  return ordenIds.filter((id) => flagged.has(id)).length;
}

/** IDs de órdenes web con pago pendiente (para badge "nuevos"). */
export async function fetchPendingPagoWebOrdenIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_web_ordenes_seguimiento_pago')
    .select('orden_id')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!error && data) {
    return (data as Array<{ orden_id: string }>)
      .map((r) => r.orden_id)
      .filter(Boolean);
  }

  const { data: fallback, error: fbErr } = await supabase
    .from('ordenes')
    .select('id')
    .eq('origen', 'Web')
    .in('estado_pago_web', [...PENDIENTE_PAGO_WEB])
    .order('created_at', { ascending: false })
    .limit(200);

  if (fbErr) throw new Error(fbErr.message);
  return (fallback ?? []).map((r) => r.id as string);
}

function readSeenPagoIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COMERCIAL_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeSeenPagoIds(ids: Iterable<string>) {
  const list = [...ids].slice(0, 400);
  localStorage.setItem(COMERCIAL_SEEN_KEY, JSON.stringify(list));
}

/**
 * Cuenta pagos pendientes que el usuario aún no “vio” en Comercial.
 * Primera visita: marca todo como visto (badge 0) para no inundar con histórico.
 */
export async function fetchComercialPagosNuevosBadgeCount(): Promise<number> {
  const ids = await fetchPendingPagoWebOrdenIds();
  if (!ids.length) return 0;

  const seen = readSeenPagoIds();
  if (seen.size === 0) {
    writeSeenPagoIds(ids);
    return 0;
  }

  return ids.filter((id) => !seen.has(id)).length;
}

/** Al entrar a Comercial: marca los pendientes actuales como vistos (quita el badge). */
export async function markComercialPagosAsSeen(): Promise<void> {
  const ids = await fetchPendingPagoWebOrdenIds();
  writeSeenPagoIds(ids);
}
