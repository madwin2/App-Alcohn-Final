import { supabase } from '../client';
import type {
  AnalyticsEventRow,
  AnalyticsSummary,
  ClienteTimelineEvent,
  ClienteWebRow,
  ComercialDashboardData,
  ComercialDateRange,
  ComercialOrigenFilter,
  ContactoSinMuestraRow,
  DailyTrendPoint,
  FunnelStep,
  MaterialBreakdown,
  MockupSinCompraRow,
  OrdenSeguimientoRow,
  PaymentStatusBreakdown,
} from '@/lib/comercial/types';
import { resolveContactoComercialEstado } from '@/lib/comercial/contacto';
import {
  bucketByDay,
  buildKpis,
  extractCotizacionEstimada,
  fillDailyTrend,
  isoRangeBounds,
  mockupOrigenFilter,
  previousRange,
  resolveClienteEtapa,
  resolvePrioridad,
  sortTimeline,
} from '@/lib/comercial/utils';
import {
  emptyExclusionSets,
  filterClientes,
  filterMockups,
  filterOrdenes,
  isJsonExcluded,
  withExclusionMeta,
  type ComercialEntityType,
  type ComercialExclusionSets,
} from '@/lib/comercial/exclusions';
import {
  analyticsVisitorKey,
  countSessions,
  countUniqueVisitors,
  filterProductionAnalytics,
  normalizeAnalyticsRow,
  type NormalizedAnalyticsRow,
} from '@/lib/comercial/analyticsNormalize';
import { estimateWebOrdenTotal, resolveWebOrderSenia } from '@/lib/comercial/webCart';
import { fetchComercialSeguimientosClientes } from '@/lib/supabase/services/comercialSeguimientos.service';
import { normalizePhoneDigitsCliente } from '@/lib/utils/phoneNormalization';
import type { Database } from '../types';

type MockupRow = Database['public']['Tables']['mockup_solicitudes']['Row'];
type ClienteRow = Database['public']['Tables']['clientes']['Row'];
type OrdenRow = Database['public']['Tables']['ordenes']['Row'];

type MockupWithCliente = MockupRow & {
  clientes: Pick<ClienteRow, 'id' | 'nombre' | 'apellido' | 'telefono' | 'mail' | 'medio_contacto' | 'created_at'> | null;
};

type OrdenWithCliente = OrdenRow & {
  clientes: Pick<ClienteRow, 'id' | 'nombre' | 'apellido' | 'telefono' | 'mail' | 'created_at'> | null;
};

const PAGO_PENDIENTE = ['pendiente', 'pago_fallido', 'esperando_comprobante', 'abandonado'] as const;
const MOCKUP_LISTO = ['completado', 'pendiente_aprobacion'] as const;
const ANALYTICS_LIMIT = 15000;

function inRange(iso: string | null | undefined, fromIso: string, toIso: string): boolean {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return normalizePhoneDigitsCliente(value) || null;
}

type WebLeadKeys = {
  clienteIds: Set<string>;
  phones: Set<string>;
};

function buildWebLeadKeys(
  mockups: Array<MockupRow | MockupWithCliente>,
  clientesWeb: ClienteRow[],
): WebLeadKeys {
  const clienteIds = new Set<string>();
  const phones = new Set<string>();

  for (const cliente of clientesWeb) {
    clienteIds.add(cliente.id);
    const phone = normalizePhone(cliente.telefono);
    if (phone) phones.add(phone);
  }

  for (const mockup of mockups) {
    if (mockup.origen !== 'web') continue;
    if (mockup.cliente_id) clienteIds.add(mockup.cliente_id);
    const phone = normalizePhone(mockup.whatsapp);
    if (phone) phones.add(phone);
  }

  return { clienteIds, phones };
}

function ordenMatchesWebLead(orden: OrdenWithCliente, webLeads: WebLeadKeys): boolean {
  if (orden.cliente_id && webLeads.clienteIds.has(orden.cliente_id)) return true;
  const phone = normalizePhone(orden.clientes?.telefono);
  return Boolean(phone && webLeads.phones.has(phone));
}

function isVentaWebDirecta(orden: OrdenWithCliente): boolean {
  return orden.origen === 'Web' && orden.estado_pago_web === 'pagado';
}

function ordenVentaAt(orden: OrdenWithCliente): string | null {
  if (orden.origen === 'Web') {
    if (orden.estado_pago_web !== 'pagado') return null;
    return orden.pago_confirmado_at ?? orden.created_at;
  }
  return orden.created_at;
}

function isVentaDerivadaDeWeb(orden: OrdenWithCliente, webLeads: WebLeadKeys): boolean {
  if (isVentaWebDirecta(orden)) return false;
  return ordenMatchesWebLead(orden, webLeads);
}

function fullName(c: { nombre?: string | null; apellido?: string | null } | null | undefined): string {
  if (!c) return 'Sin nombre';
  return [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

function applyMockupOrigen<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  origen: ComercialOrigenFilter,
): T {
  const filter = mockupOrigenFilter(origen);
  if (filter) return query.eq('origen', filter);
  return query;
}

async function fetchAnalyticsRows(
  fromIso: string,
  toIso: string,
  origen: ComercialOrigenFilter,
): Promise<{
  rows: NormalizedAnalyticsRow[];
  available: boolean;
  reason?: string;
}> {
  const { data, error } = await supabase
    .from('web_analytics_events')
    .select('*')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(ANALYTICS_LIMIT);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
      return { rows: [], available: false, reason: 'La tabla web_analytics_events aún no está creada en Supabase.' };
    }
    return { rows: [], available: false, reason: error.message };
  }

  let rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeAnalyticsRow);
  if (origen === 'web') {
    rows = filterProductionAnalytics(rows);
  }

  return { rows, available: true };
}

function aggregateAnalytics(rows: NormalizedAnalyticsRow[]): Omit<AnalyticsSummary, 'available' | 'unavailableReason'> {
  let pageViews = 0;
  let whatsappClicks = 0;
  let leadFormStarts = 0;
  let leadFormSubmits = 0;
  const pageCounts = new Map<string, number>();
  const utmCounts = new Map<string, number>();

  for (const row of rows) {
    const type = row.eventName.toLowerCase();

    if (type === 'page_view') pageViews += 1;
    if (type === 'whatsapp_click') whatsappClicks += 1;
    if (type === 'lead_form_start') leadFormStarts += 1;
    if (type === 'lead_form_submit') leadFormSubmits += 1;

    if (row.pagePath) {
      pageCounts.set(row.pagePath, (pageCounts.get(row.pagePath) ?? 0) + 1);
    }

    const source = row.utmSource?.trim() || '(directo)';
    const campaign = row.utmCampaign?.trim() || '(sin campaña)';
    const utmKey = `${source}::${campaign}`;
    utmCounts.set(utmKey, (utmCounts.get(utmKey) ?? 0) + 1);
  }

  const topPages = [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));

  const topUtms = [...utmCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => {
      const [source, campaign] = key.split('::');
      return { source, campaign, count };
    });

  const recentEvents: AnalyticsEventRow[] = rows.slice(0, 40).map((r) => ({
    id: r.id,
    eventType: r.eventName,
    pagePath: r.pagePath,
    createdAt: r.createdAt,
    utmSource: r.utmSource,
    utmCampaign: r.utmCampaign,
    visitorId: r.visitorId,
    sessionId: r.sessionId,
  }));

  return {
    pageViews,
    uniqueVisitors: countUniqueVisitors(rows),
    sessions: countSessions(rows),
    whatsappClicks,
    leadFormStarts,
    leadFormSubmits,
    topPages,
    topUtms,
    recentEvents,
  };
}

function analyticsVisitorBuckets(rows: NormalizedAnalyticsRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.createdAt) continue;
    const key = analyticsVisitorKey(row) ?? (row.eventName === 'page_view' ? `pv:${row.id}` : null);
    if (!key) continue;
    const d = new Date(row.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(day)) map.set(day, new Set());
    map.get(day)!.add(key);
  }
  return map;
}

async function loadComercialExclusionSets(): Promise<ComercialExclusionSets> {
  const sets = emptyExclusionSets();

  const [{ data: tableRows, error: tableErr }, mockupFlags, ordenFlags] = await Promise.all([
    supabase.from('comercial_exclusiones').select('entity_type, entity_id'),
    supabase.from('mockup_solicitudes').select('id, metadata_web').limit(5000),
    supabase.from('ordenes').select('id, notas_web').eq('origen', 'Web').limit(5000),
  ]);

  if (!tableErr && tableRows) {
    for (const row of tableRows) {
      if (row.entity_type === 'mockup') sets.mockups.add(row.entity_id);
      if (row.entity_type === 'orden') sets.ordenes.add(row.entity_id);
      if (row.entity_type === 'cliente') sets.clientes.add(row.entity_id);
    }
  }

  for (const row of (mockupFlags.data ?? []) as Array<{ id: string; metadata_web?: Record<string, unknown> | null }>) {
    if (isJsonExcluded(row.metadata_web)) sets.mockups.add(row.id);
  }

  for (const row of (ordenFlags.data ?? []) as Array<{ id: string; notas_web?: Record<string, unknown> | null }>) {
    if (isJsonExcluded(row.notas_web)) sets.ordenes.add(row.id);
  }

  return sets;
}

export async function excludeFromComercialWeb(params: {
  entityType: ComercialEntityType;
  entityId: string;
  motivo?: string;
  excluidoPor?: string | null;
}): Promise<void> {
  const { entityType, entityId, motivo, excluidoPor } = params;
  let tableOk = false;

  const { error: tableErr } = await supabase.from('comercial_exclusiones').upsert(
    {
      entity_type: entityType,
      entity_id: entityId,
      motivo: motivo?.trim() || 'Prueba / dato interno',
      excluido_por: excluidoPor ?? null,
    },
    { onConflict: 'entity_type,entity_id' },
  );

  if (!tableErr) {
    tableOk = true;
  }

  if (entityType === 'mockup') {
    const { data, error: readErr } = await supabase
      .from('mockup_solicitudes')
      .select('metadata_web')
      .eq('id', entityId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const { error } = await supabase
      .from('mockup_solicitudes')
      .update({ metadata_web: withExclusionMeta(data?.metadata_web as Record<string, unknown> | null, motivo) })
      .eq('id', entityId);
    if (error) throw new Error(error.message);
    return;
  }

  if (entityType === 'orden') {
    const { data, error: readErr } = await supabase
      .from('ordenes')
      .select('notas_web')
      .eq('id', entityId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const { error } = await supabase
      .from('ordenes')
      .update({ notas_web: withExclusionMeta(data?.notas_web as Record<string, unknown> | null, motivo) })
      .eq('id', entityId);
    if (error) throw new Error(error.message);
    return;
  }

  if (!tableOk) {
    throw new Error(
      'Para excluir contactos ejecutá migration_comercial_exclusiones.sql en Supabase (SQL Editor).',
    );
  }
}

async function fetchMockups(fromIso: string, toIso: string, origen: ComercialOrigenFilter) {
  let query = supabase
    .from('mockup_solicitudes')
    .select(
      '*, clientes(id, nombre, apellido, telefono, mail, medio_contacto, created_at)',
    )
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });

  query = applyMockupOrigen(query, origen);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MockupWithCliente[];
}

async function fetchAllMockupsForClientes(origen: ComercialOrigenFilter) {
  let query = supabase
    .from('mockup_solicitudes')
    .select(
      'id, cliente_id, created_at, estado, orden_id, checkout_iniciado_at, checkout_completado_at, origen, material, whatsapp, email, mockup_cuero_url, mockup_madera_url, medidas_cotizacion_json, nombre_muestra, nombre_slug, metadata_web',
    )
    .order('created_at', { ascending: false })
    .limit(5000);

  query = applyMockupOrigen(query, origen);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MockupRow[];
}

async function fetchClientesWeb(fromIso: string, toIso: string) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, telefono, mail, medio_contacto, created_at, updated_at')
    .eq('medio_contacto', 'Web')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteRow[];
}

async function fetchAllWebClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, telefono, mail, medio_contacto, created_at, updated_at')
    .eq('medio_contacto', 'Web')
    .order('updated_at', { ascending: false })
    .limit(3000);

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteRow[];
}

async function fetchOrdenesWeb(fromIso: string, toIso: string) {
  const { data, error } = await supabase
    .from('ordenes')
    .select(
      '*, clientes(id, nombre, apellido, telefono, mail, created_at)',
    )
    .eq('origen', 'Web')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(3000);

  if (error) throw new Error(error.message);
  return (data ?? []) as OrdenWithCliente[];
}

async function fetchAllOrdenesWithCliente() {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*, clientes(id, nombre, apellido, telefono, mail, medio_contacto, created_at)')
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) throw new Error(error.message);
  return (data ?? []) as OrdenWithCliente[];
}

async function enrichOrdenesSeguimientoView(
  rows: Array<{
    orden_id: string;
    created_at: string;
    estado_pago_web: string;
    metodo_pago: string | null;
    valor_total: number | null;
    senia_total: number | null;
    pago_error_mensaje: string | null;
    comprobante_subido_at: string | null;
    comprobante_url: string | null;
    web_checkout_ref: string | null;
    cliente_id: string;
    nombre: string;
    apellido: string;
    telefono: string;
    mail: string | null;
  }>,
) {
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.orden_id);
  const { data, error } = await supabase
    .from('ordenes')
    .select('id, notas_web, carrito_json')
    .in('id', ids);

  if (error) throw new Error(error.message);

  const byId = new Map(
    ((data ?? []) as Array<{ id: string; notas_web: Record<string, unknown> | null; carrito_json: unknown }>).map(
      (row) => [row.id, row],
    ),
  );

  return rows.map((row) => ({
    ...row,
    notas_web: byId.get(row.orden_id)?.notas_web ?? null,
    carrito_json: byId.get(row.orden_id)?.carrito_json ?? null,
  }));
}

async function fetchOrdenesSeguimientoAll() {
  const { data, error } = await supabase
    .from('v_web_ordenes_seguimiento_pago')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    const { data: fallback, error: fbErr } = await supabase
      .from('ordenes')
      .select('*, clientes(id, nombre, apellido, telefono, mail)')
      .eq('origen', 'Web')
      .in('estado_pago_web', [...PAGO_PENDIENTE])
      .order('created_at', { ascending: false })
      .limit(500);

    if (fbErr) throw new Error(fbErr.message);
    return (fallback ?? []) as OrdenWithCliente[];
  }

  return enrichOrdenesSeguimientoView(
    (data ?? []) as Array<{
      orden_id: string;
      created_at: string;
      estado_pago_web: string;
      metodo_pago: string | null;
      valor_total: number | null;
      senia_total: number | null;
      pago_error_mensaje: string | null;
      comprobante_subido_at: string | null;
      comprobante_url: string | null;
      web_checkout_ref: string | null;
      cliente_id: string;
      nombre: string;
      apellido: string;
      telefono: string;
      mail: string | null;
    }>,
  );
}

async function fetchMockupsSinCompraAll(origen: ComercialOrigenFilter) {
  let query = supabase
    .from('v_web_mockups_sin_compra')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const { data, error } = await query;
  if (!error && data) {
    let rows = data as Array<{
      mockup_id: string;
      created_at: string;
      estado: string;
      material: string;
      whatsapp: string | null;
      email: string | null;
      mockup_cuero_url: string | null;
      mockup_madera_url: string | null;
      medidas_cotizacion_json: Record<string, unknown>[] | null;
      metadata_web?: Record<string, unknown> | null;
      cliente_id: string | null;
      nombre: string;
      apellido: string;
      telefono: string;
      mail: string | null;
    }>;

    if (origen === 'web') {
      // vista ya filtra origen web
    } else if (origen === 'app') {
      return [];
    }
    return rows;
  }

  let fbQuery = supabase
    .from('mockup_solicitudes')
    .select('*, clientes(nombre, apellido, telefono, mail)')
    .is('orden_id', null)
    .in('estado', [...MOCKUP_LISTO])
    .order('created_at', { ascending: false })
    .limit(500);

  fbQuery = applyMockupOrigen(fbQuery, origen);
  const { data: fbData, error: fbErr } = await fbQuery;
  if (fbErr) throw new Error(fbErr.message);

  return ((fbData ?? []) as MockupWithCliente[]).map((m) => ({
    mockup_id: m.id,
    created_at: m.created_at,
    estado: m.estado,
    material: m.material,
    whatsapp: m.whatsapp,
    email: m.email ?? m.clientes?.mail ?? null,
    mockup_cuero_url: m.mockup_cuero_url,
    mockup_madera_url: m.mockup_madera_url,
    medidas_cotizacion_json: m.medidas_cotizacion_json,
    metadata_web: m.metadata_web ?? null,
    cliente_id: m.cliente_id ?? null,
    nombre: m.clientes?.nombre ?? '',
    apellido: m.clientes?.apellido ?? '',
    telefono: m.clientes?.telefono ?? m.whatsapp ?? '',
    mail: m.clientes?.mail ?? m.email ?? null,
  }));
}

function mapMockupSinCompra(
  row: {
    mockup_id: string;
    created_at: string;
    estado: string;
    material: string;
    whatsapp: string | null;
    email: string | null;
    mockup_cuero_url: string | null;
    mockup_madera_url: string | null;
    medidas_cotizacion_json: Record<string, unknown>[] | null;
    metadata_web?: Record<string, unknown> | null;
    cliente_id: string | null;
    nombre: string;
    apellido: string;
    telefono: string;
    mail: string | null;
  },
  checkoutIniciado = false,
): MockupSinCompraRow {
  const now = new Date();
  const meta = row.metadata_web ?? null;
  const eligibleRaw = meta?.contacto_comercial_eligible_at;
  const enviadoRaw = meta?.contacto_comercial_enviado_at;
  const eligibleAt =
    typeof eligibleRaw === 'string'
      ? eligibleRaw
      : eligibleRaw != null
        ? String(eligibleRaw)
        : null;
  const enviadoAt =
    typeof enviadoRaw === 'string' ? enviadoRaw : enviadoRaw != null ? String(enviadoRaw) : null;

  return {
    mockupId: row.mockup_id,
    createdAt: row.created_at,
    estado: row.estado,
    material: row.material,
    nombre: [row.nombre, row.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre',
    telefono: row.telefono || null,
    email: row.mail || row.email || null,
    whatsapp: row.whatsapp,
    mockupCueroUrl: row.mockup_cuero_url,
    mockupMaderaUrl: row.mockup_madera_url,
    cotizacionEstimada: extractCotizacionEstimada(row.medidas_cotizacion_json),
    diasSinCompra: Math.max(0, Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86400000)),
    checkoutIniciado,
    clienteId: row.cliente_id,
    prioridad: resolvePrioridad({ checkoutIniciado, mockupListo: true }),
    contactoComercialEstado: resolveContactoComercialEstado(meta),
    contactoComercialEligibleAt: eligibleAt,
    contactoComercialEnviadoAt: enviadoAt,
  };
}

function resolveValorTotalDisplay(
  valorTotal: number | null | undefined,
  notasWeb: Record<string, unknown> | null | undefined,
  metodoPago: string | null | undefined,
  carritoJson: unknown,
): number | null {
  const estimated = estimateWebOrdenTotal({ notasWeb, carritoJson, metodoPago });
  if (estimated != null && estimated > 0) return estimated;
  if (valorTotal != null && valorTotal > 0) return valorTotal;
  return null;
}

function mapOrdenSeguimiento(row: OrdenWithCliente): OrdenSeguimientoRow {
  const now = new Date();
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    ordenId: row.id,
    createdAt,
    estadoPagoWeb: row.estado_pago_web ?? 'pendiente',
    metodoPago: row.metodo_pago ?? null,
    valorTotal: resolveValorTotalDisplay(
      row.valor_total,
      row.notas_web as Record<string, unknown> | null,
      row.metodo_pago ?? null,
      row.carrito_json,
    ),
    seniaEsperada: resolveWebOrderSenia(row.notas_web as Record<string, unknown> | null),
    seniaTotal: row.senia_total,
    pagoErrorMensaje: row.pago_error_mensaje ?? null,
    comprobanteSubido: Boolean(row.comprobante_subido_at || row.comprobante_url),
    comprobanteUrl: row.comprobante_url ?? null,
    webCheckoutRef: row.web_checkout_ref ?? null,
    nombre: fullName(row.clientes),
    telefono: row.clientes?.telefono ?? null,
    email: row.clientes?.mail ?? null,
    clienteId: row.cliente_id,
    diasPendiente: Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86400000)),
    prioridad: 'caliente',
  };
}

function mapOrdenSeguimientoView(row: {
  orden_id: string;
  created_at: string;
  estado_pago_web: string;
  metodo_pago: string | null;
  valor_total: number | null;
  senia_total: number | null;
  pago_error_mensaje: string | null;
  comprobante_subido_at: string | null;
  comprobante_url: string | null;
  web_checkout_ref: string | null;
  notas_web?: Record<string, unknown> | null;
  carrito_json?: unknown;
  cliente_id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  mail: string | null;
}): OrdenSeguimientoRow {
  const now = new Date();
  return {
    ordenId: row.orden_id,
    createdAt: row.created_at,
    estadoPagoWeb: row.estado_pago_web,
    metodoPago: row.metodo_pago,
    valorTotal: resolveValorTotalDisplay(
      row.valor_total,
      row.notas_web,
      row.metodo_pago,
      row.carrito_json,
    ),
    seniaEsperada: resolveWebOrderSenia(row.notas_web),
    seniaTotal: row.senia_total,
    pagoErrorMensaje: row.pago_error_mensaje,
    comprobanteSubido: Boolean(row.comprobante_subido_at || row.comprobante_url),
    comprobanteUrl: row.comprobante_url,
    webCheckoutRef: row.web_checkout_ref,
    nombre: [row.nombre, row.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre',
    telefono: row.telefono,
    email: row.mail,
    clienteId: row.cliente_id,
    diasPendiente: Math.max(0, Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86400000)),
    prioridad: 'caliente',
  };
}

function computeCounts(
  range: ComercialDateRange,
  mockups: MockupRow[] | MockupWithCliente[],
  clientes: ClienteRow[],
  ordenes: OrdenWithCliente[],
  analyticsRows: NormalizedAnalyticsRow[],
  webLeads: WebLeadKeys,
  allOrdenes: OrdenWithCliente[],
) {
  const { fromIso, toIso } = isoRangeBounds(range);

  const analyticsAgg = aggregateAnalytics(analyticsRows);
  const checkoutsFromMockups = mockups.filter((m) =>
    inRange(m.checkout_iniciado_at, fromIso, toIso),
  ).length;
  const checkoutsFromOrders = ordenes.filter((o) => inRange(o.created_at, fromIso, toIso)).length;
  const ventas = allOrdenes.filter((o) => {
    const ventaAt = ordenVentaAt(o);
    return isVentaWebDirecta(o) && ventaAt != null && inRange(ventaAt, fromIso, toIso);
  }).length;
  const ventasDerivadas = allOrdenes.filter((o) => {
    const ventaAt = ordenVentaAt(o);
    return (
      ventaAt != null &&
      inRange(ventaAt, fromIso, toIso) &&
      isVentaDerivadaDeWeb(o, webLeads)
    );
  }).length;

  return {
    visitantes: analyticsAgg.uniqueVisitors,
    sesiones: analyticsAgg.sessions,
    contactos: clientes.length,
    muestras: mockups.length,
    checkouts: Math.max(checkoutsFromMockups, checkoutsFromOrders),
    ventas,
    ventasDerivadas,
  };
}

function buildMaterialBreakdown(mockups: MockupRow[], ordenesPagadas: OrdenWithCliente[]): MaterialBreakdown[] {
  const map = new Map<string, { count: number; ventas: number }>();
  for (const m of mockups) {
    const key = m.material ?? 'otros';
    const prev = map.get(key) ?? { count: 0, ventas: 0 };
    prev.count += 1;
    map.set(key, prev);
  }
  for (const o of ordenesPagadas) {
    if (o.estado_pago_web !== 'pagado') continue;
    const key = 'ventas';
    const prev = map.get(key) ?? { count: 0, ventas: 0 };
    prev.ventas += 1;
    map.set(key, prev);
  }

  const materialOnly = [...map.entries()]
    .filter(([k]) => k !== 'ventas')
    .map(([material, v]) => ({ material, count: v.count, ventas: 0 }));

  return materialOnly.sort((a, b) => b.count - a.count);
}

function buildPaymentBreakdown(ordenes: OrdenWithCliente[]): PaymentStatusBreakdown[] {
  const colors: Record<string, string> = {
    pendiente: 'hsl(45 93% 47%)',
    pago_fallido: 'hsl(0 84% 60%)',
    esperando_comprobante: 'hsl(217 91% 60%)',
    abandonado: 'hsl(215 16% 47%)',
    pagado: 'hsl(142 71% 45%)',
  };
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    pago_fallido: 'Pago fallido',
    esperando_comprobante: 'Esperando comprobante',
    abandonado: 'Abandonado',
    pagado: 'Pagado',
  };

  const counts = new Map<string, number>();
  for (const o of ordenes) {
    const st = o.estado_pago_web ?? 'pendiente';
    counts.set(st, (counts.get(st) ?? 0) + 1);
  }

  return [...counts.entries()].map(([estado, count]) => ({
    estado,
    label: labels[estado] ?? estado,
    count,
    color: colors[estado] ?? 'hsl(var(--muted-foreground))',
  }));
}

function buildDailyTrend(
  range: ComercialDateRange,
  mockups: MockupRow[],
  clientes: ClienteRow[],
  ordenes: OrdenWithCliente[],
  analyticsRows: NormalizedAnalyticsRow[],
): DailyTrendPoint[] {
  const { fromIso, toIso } = isoRangeBounds(range);
  const contactos = bucketByDay(clientes.map((c) => c.created_at).filter(Boolean) as string[]);
  const muestras = bucketByDay(mockups.map((m) => m.created_at));
  const checkouts = bucketByDay(
    mockups
      .map((m) => m.checkout_iniciado_at)
      .filter((d): d is string => typeof d === 'string' && d >= fromIso && d <= toIso),
  );
  const ventas = bucketByDay(
    ordenes
      .filter((o) => o.estado_pago_web === 'pagado')
      .map((o) => o.pago_confirmado_at ?? o.created_at)
      .filter((d): d is string => Boolean(d)),
  );
  const visitantes = analyticsVisitorBuckets(analyticsRows);

  return fillDailyTrend(range.from, range.to, {
    visitantes,
    contactos,
    muestras,
    checkouts,
    ventas,
  });
}

function buildClientesWeb(
  clientes: ClienteRow[],
  mockupsByCliente: Map<string, MockupRow[]>,
  ordenesByCliente: Map<string, OrdenWithCliente[]>,
): ClienteWebRow[] {
  const allIds = new Set<string>();
  clientes.forEach((c) => allIds.add(c.id));
  mockupsByCliente.forEach((_, id) => allIds.add(id));
  ordenesByCliente.forEach((_, id) => allIds.add(id));

  const rows: ClienteWebRow[] = [];

  for (const clienteId of allIds) {
    const cliente =
      clientes.find((c) => c.id === clienteId) ??
      ({
        id: clienteId,
        nombre: 'Cliente',
        apellido: '',
        telefono: '',
        mail: null,
        created_at: null,
        updated_at: null,
      } as ClienteRow);

    const mockups = mockupsByCliente.get(clienteId) ?? [];
    const ordenes = ordenesByCliente.get(clienteId) ?? [];
    const ordenesPagadas = ordenes.filter((o) => ordenVentaAt(o) != null);
    const tieneCheckoutPendiente = ordenes.some((o) =>
      PAGO_PENDIENTE.includes(o.estado_pago_web as (typeof PAGO_PENDIENTE)[number]),
    );
    const tieneMockupSinCompra = mockups.some(
      (m) => !m.orden_id && MOCKUP_LISTO.includes(m.estado as (typeof MOCKUP_LISTO)[number]),
    );

    const dates = [
      cliente.created_at,
      cliente.updated_at,
      ...mockups.map((m) => m.created_at),
      ...mockups.map((m) => m.updated_at),
      ...ordenes.map((o) => o.created_at),
      ...ordenes.map((o) => o.updated_at),
    ].filter(Boolean) as string[];

    const ultimaActividad = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? '';

    rows.push({
      clienteId,
      nombre: fullName(cliente),
      telefono: cliente.telefono,
      email: cliente.mail,
      etapa: resolveClienteEtapa({
        mockupsCount: mockups.length,
        ordenesPagadasCount: ordenesPagadas.length,
        tieneCheckoutPendiente,
        tieneMockupSinCompra,
      }),
      mockupsCount: mockups.length,
      ordenesPagadasCount: ordenesPagadas.length,
      ultimaActividad,
      valorTotalCompras: ordenesPagadas.reduce((acc, o) => acc + (o.valor_total ?? 0), 0),
    });
  }

  return rows.sort(
    (a, b) => new Date(b.ultimaActividad).getTime() - new Date(a.ultimaActividad).getTime(),
  );
}

function buildContactosSinMuestra(
  clientes: ClienteRow[],
  mockupsByCliente: Map<string, MockupRow[]>,
): ContactoSinMuestraRow[] {
  const now = new Date();
  return clientes
    .filter((c) => !mockupsByCliente.has(c.id) || (mockupsByCliente.get(c.id)?.length ?? 0) === 0)
    .map((c) => ({
      clienteId: c.id,
      createdAt: c.created_at ?? now.toISOString(),
      nombre: fullName(c),
      telefono: c.telefono,
      email: c.mail,
      diasDesdeContacto: Math.max(
        0,
        Math.floor((now.getTime() - new Date(c.created_at ?? now).getTime()) / 86400000),
      ),
      prioridad: 'frio' as const,
    }));
}

export async function fetchComercialDashboard(
  range: ComercialDateRange,
  origen: ComercialOrigenFilter,
): Promise<ComercialDashboardData> {
  const { fromIso, toIso } = isoRangeBounds(range);
  const prev = previousRange(range);
  const exclusions = await loadComercialExclusionSets();

  const [
    analyticsCurrent,
    analyticsPrevious,
    mockupsRange,
    mockupsPrev,
    clientesRange,
    clientesPrev,
    ordenesRange,
    ordenesPrev,
    mockupsSinCompraRaw,
    ordenesSeguimientoRaw,
    seguimientosClientes,
    allMockups,
    allClientes,
    allOrdenesWeb,
    allOrdenes,
  ] = await Promise.all([
    fetchAnalyticsRows(fromIso, toIso, origen),
    fetchAnalyticsRows(isoRangeBounds(prev).fromIso, isoRangeBounds(prev).toIso, origen),
    fetchMockups(fromIso, toIso, origen),
    fetchMockups(isoRangeBounds(prev).fromIso, isoRangeBounds(prev).toIso, origen),
    fetchClientesWeb(fromIso, toIso),
    fetchClientesWeb(isoRangeBounds(prev).fromIso, isoRangeBounds(prev).toIso),
    fetchOrdenesWeb(fromIso, toIso),
    fetchOrdenesWeb(isoRangeBounds(prev).fromIso, isoRangeBounds(prev).toIso),
    fetchMockupsSinCompraAll(origen),
    fetchOrdenesSeguimientoAll(),
    fetchComercialSeguimientosClientes(),
    fetchAllMockupsForClientes(origen),
    fetchAllWebClientes(),
    supabase
      .from('ordenes')
      .select('*, clientes(id, nombre, apellido, telefono, mail, created_at)')
      .eq('origen', 'Web')
      .order('created_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as OrdenWithCliente[];
      }),
    fetchAllOrdenesWithCliente(),
  ]);

  const mockupsRangeFiltered = filterMockups(mockupsRange, exclusions);
  const mockupsPrevFiltered = filterMockups(mockupsPrev, exclusions);
  const clientesRangeFiltered = filterClientes(clientesRange, exclusions);
  const clientesPrevFiltered = filterClientes(clientesPrev, exclusions);
  const ordenesRangeFiltered = filterOrdenes(ordenesRange, exclusions);
  const ordenesPrevFiltered = filterOrdenes(ordenesPrev, exclusions);
  const allMockupsFiltered = filterMockups(allMockups, exclusions);
  const allClientesFiltered = filterClientes(allClientes, exclusions);
  const allOrdenesWebFiltered = filterOrdenes(allOrdenesWeb, exclusions);
  const allOrdenesFiltered = filterOrdenes(allOrdenes, exclusions);
  const webLeads = buildWebLeadKeys(allMockupsFiltered, allClientesFiltered);

  const mockupsSinCompraRawFiltered = mockupsSinCompraRaw.filter(
    (r) => !exclusions.mockups.has(r.mockup_id),
  );
  const ordenesSeguimientoRawFiltered = ordenesSeguimientoRaw.filter((row) => {
    const ordenId = 'orden_id' in row ? row.orden_id : (row as OrdenWithCliente).id;
    return !exclusions.ordenes.has(ordenId);
  });

  const checkoutByMockupId = new Map<string, boolean>();
  for (const m of allMockupsFiltered) {
    if (m.checkout_iniciado_at) checkoutByMockupId.set(m.id, true);
  }

  const mockupsSinCompra = mockupsSinCompraRawFiltered
    .filter((r) => !r.cliente_id || !exclusions.clientes.has(r.cliente_id))
    .map((r) => mapMockupSinCompra(r, checkoutByMockupId.get(r.mockup_id) ?? false));

  const ordenesSeguimiento = ordenesSeguimientoRawFiltered
    .filter((row) => {
      const clienteId = 'cliente_id' in row ? row.cliente_id : (row as OrdenWithCliente).cliente_id;
      return !exclusions.clientes.has(clienteId);
    })
    .map((row) => {
      if ('orden_id' in row) return mapOrdenSeguimientoView(row);
      return mapOrdenSeguimiento(row as OrdenWithCliente);
    });

  const mockupsByCliente = new Map<string, MockupRow[]>();
  for (const m of allMockupsFiltered) {
    if (!m.cliente_id || exclusions.clientes.has(m.cliente_id)) continue;
    const list = mockupsByCliente.get(m.cliente_id) ?? [];
    list.push(m);
    mockupsByCliente.set(m.cliente_id, list);
  }

  const ordenesByCliente = new Map<string, OrdenWithCliente[]>();
  for (const o of allOrdenesFiltered) {
    if (exclusions.clientes.has(o.cliente_id)) continue;
    const list = ordenesByCliente.get(o.cliente_id) ?? [];
    list.push(o);
    ordenesByCliente.set(o.cliente_id, list);
  }

  const contactosSinMuestra = buildContactosSinMuestra(clientesRangeFiltered, mockupsByCliente);
  const clientesWeb = buildClientesWeb(allClientesFiltered, mockupsByCliente, ordenesByCliente);

  const currentCounts = computeCounts(
    range,
    mockupsRangeFiltered,
    clientesRangeFiltered,
    ordenesRangeFiltered,
    analyticsCurrent.rows,
    webLeads,
    allOrdenesFiltered,
  );
  const previousCounts = computeCounts(
    prev,
    mockupsPrevFiltered,
    clientesPrevFiltered,
    ordenesPrevFiltered,
    analyticsPrevious.rows,
    webLeads,
    allOrdenesFiltered,
  );

  const kpis = buildKpis({ current: currentCounts, previous: previousCounts });

  const funnel: FunnelStep[] = [
    { key: 'visitantes', label: 'Visitantes', value: currentCounts.visitantes, color: 'hsl(215 16% 47%)' },
    { key: 'contactos', label: 'Contactos', value: currentCounts.contactos, color: 'hsl(217 91% 60%)' },
    { key: 'muestras', label: 'Muestras', value: currentCounts.muestras, color: 'hsl(262 83% 58%)' },
    { key: 'checkouts', label: 'Checkouts', value: currentCounts.checkouts, color: 'hsl(45 93% 47%)' },
    { key: 'ventas', label: 'Ventas', value: currentCounts.ventas, color: 'hsl(142 71% 45%)' },
  ];

  const analyticsAgg = aggregateAnalytics(analyticsCurrent.rows);
  const analytics: AnalyticsSummary = {
    available: analyticsCurrent.available,
    unavailableReason: analyticsCurrent.reason,
    ...analyticsAgg,
  };

  return {
    kpis,
    funnel,
    dailyTrend: buildDailyTrend(
      range,
      mockupsRangeFiltered,
      clientesRangeFiltered,
      ordenesRangeFiltered,
      analyticsCurrent.rows,
    ),
    materialBreakdown: buildMaterialBreakdown(mockupsRangeFiltered, ordenesRangeFiltered),
    paymentBreakdown: buildPaymentBreakdown(ordenesRangeFiltered),
    mockupsSinCompra,
    ordenesSeguimiento,
    contactosSinMuestra,
    clientesWeb,
    seguimientosClientes,
    analytics,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchClienteTimeline(clienteId: string): Promise<ClienteTimelineEvent[]> {
  const [clienteRes, mockupsRes, ordenesRes] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle(),
    supabase
      .from('mockup_solicitudes')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false }),
    supabase
      .from('ordenes')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false }),
  ]);

  if (clienteRes.error) throw new Error(clienteRes.error.message);
  if (mockupsRes.error) throw new Error(mockupsRes.error.message);
  if (ordenesRes.error) throw new Error(ordenesRes.error.message);

  const events: ClienteTimelineEvent[] = [];
  const cliente = clienteRes.data as ClienteRow | null;

  if (cliente?.created_at) {
    events.push({
      id: `contacto-${cliente.id}`,
      kind: 'contacto',
      label: 'Dejó datos de contacto',
      detail: `Medio: ${cliente.medio_contacto ?? '—'}`,
      at: cliente.created_at,
    });
  }

  for (const m of (mockupsRes.data ?? []) as MockupRow[]) {
    events.push({
      id: `mockup-${m.id}`,
      kind: 'mockup',
      label: `Muestra: ${m.nombre_muestra || m.nombre_slug}`,
      detail: `Material: ${m.material} · Estado: ${m.estado}`,
      at: m.created_at,
      url: m.mockup_cuero_url || m.mockup_madera_url || m.archivo_base_url,
    });
    if (m.checkout_iniciado_at) {
      events.push({
        id: `checkout-inicio-${m.id}`,
        kind: 'checkout_inicio',
        label: 'Inició checkout',
        at: m.checkout_iniciado_at,
      });
    }
    if (m.checkout_completado_at) {
      events.push({
        id: `checkout-completo-${m.id}`,
        kind: 'checkout_completo',
        label: 'Completó datos de checkout',
        at: m.checkout_completado_at,
      });
    }
  }

  for (const o of (ordenesRes.data ?? []) as OrdenRow[]) {
    events.push({
      id: `orden-${o.id}`,
      kind: 'orden',
      label: `Pedido web · ${o.estado_pago_web ?? '—'}`,
      detail: o.valor_total != null ? `Total: $${o.valor_total}` : undefined,
      at: o.created_at ?? new Date().toISOString(),
    });

    if (o.estado_pago_web === 'pagado' && o.pago_confirmado_at) {
      events.push({
        id: `pago-ok-${o.id}`,
        kind: 'pago_ok',
        label: 'Pago confirmado',
        detail: o.metodo_pago ?? undefined,
        at: o.pago_confirmado_at,
      });
    } else if (o.estado_pago_web === 'pago_fallido') {
      events.push({
        id: `pago-fallido-${o.id}`,
        kind: 'pago_fallido',
        label: 'Pago fallido',
        detail: o.pago_error_mensaje ?? undefined,
        at: o.ultimo_intento_pago_at ?? o.created_at ?? new Date().toISOString(),
      });
    }
  }

  return sortTimeline(events);
}
