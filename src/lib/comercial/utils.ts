import type {
  ClienteEtapa,
  ClienteTimelineEvent,
  ComercialDateRange,
  ComercialKpi,
  ComercialOrigenFilter,
  ContactoSinMuestraRow,
  MockupSinCompraRow,
  OrdenSeguimientoRow,
  PotencialPrioridad,
} from './types';

export const MATERIAL_LABELS: Record<string, string> = {
  cuero: 'Cuero',
  madera: 'Madera',
  ambos: 'Cuero y madera',
  ceramica: 'Cerámica',
  alimentos: 'Alimentos',
  otros: 'Otros',
};

export const ETAPA_LABELS: Record<ClienteEtapa, string> = {
  solo_contacto: 'Solo contacto',
  con_muestra: 'Con muestra',
  checkout: 'Checkout pendiente',
  comprador: 'Comprador',
  recurrente: 'Recurrente',
};

export const PRIORIDAD_LABELS: Record<PotencialPrioridad, string> = {
  caliente: 'Caliente',
  tibio: 'Tibio',
  frio: 'Frío',
};

export const PAGO_ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  pago_fallido: 'Pago fallido',
  esperando_comprobante: 'Esperando comprobante',
  abandonado: 'Abandonado',
  pagado: 'Pagado',
};

export function formatArs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysSince(iso: string, now = new Date()): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function conversionRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current / previous) * 100;
}

export function escapeCsvValue(value: string): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsvValue).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function whatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && !digits.startsWith('54')) digits = `549${digits}`;
  if (digits.length === 11 && digits.startsWith('9')) digits = `54${digits}`;
  return `https://wa.me/${digits}`;
}

export function extractCotizacionEstimada(
  medidas: Record<string, unknown>[] | null | undefined,
): number | null {
  if (!Array.isArray(medidas) || medidas.length === 0) return null;
  let max: number | null = null;
  for (const item of medidas) {
    const raw = item.precio_transferencia_ars;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      max = max == null ? raw : Math.max(max, raw);
    }
  }
  return max;
}

export function resolvePrioridad(input: {
  checkoutIniciado?: boolean;
  mockupListo?: boolean;
  pagoPendiente?: boolean;
}): PotencialPrioridad {
  if (input.pagoPendiente || input.checkoutIniciado) return 'caliente';
  if (input.mockupListo) return 'tibio';
  return 'frio';
}

export function resolveClienteEtapa(input: {
  mockupsCount: number;
  ordenesPagadasCount: number;
  tieneCheckoutPendiente: boolean;
  tieneMockupSinCompra: boolean;
}): ClienteEtapa {
  if (input.ordenesPagadasCount > 1 || input.mockupsCount > 1) return 'recurrente';
  if (input.ordenesPagadasCount >= 1) return 'comprador';
  if (input.tieneCheckoutPendiente) return 'checkout';
  if (input.tieneMockupSinCompra || input.mockupsCount >= 1) return 'con_muestra';
  return 'solo_contacto';
}

export function isoRangeBounds(range: ComercialDateRange): { fromIso: string; toIso: string } {
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export function previousRange(range: ComercialDateRange): ComercialDateRange {
  const ms = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - ms);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function presetRange(days: number): ComercialDateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function mockupOrigenFilter(origen: ComercialOrigenFilter): 'web' | 'app' | null {
  if (origen === 'web') return 'web';
  if (origen === 'app') return 'app';
  return null;
}

export function bucketByDay(isoDates: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const iso of isoDates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function fillDailyTrend(
  from: Date,
  to: Date,
  buckets: {
    visitantes: Map<string, Set<string>>;
    contactos: Map<string, number>;
    muestras: Map<string, number>;
    checkouts: Map<string, number>;
    ventas: Map<string, number>;
  },
) {
  const points = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    points.push({
      date: key,
      visitantes: buckets.visitantes.get(key)?.size ?? 0,
      contactos: buckets.contactos.get(key) ?? 0,
      muestras: buckets.muestras.get(key) ?? 0,
      checkouts: buckets.checkouts.get(key) ?? 0,
      ventas: buckets.ventas.get(key) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export function buildKpis(input: {
  current: Record<string, number>;
  previous: Record<string, number>;
}): ComercialKpi[] {
  const defs: Array<{ key: ComercialKpi['key']; label: string; stepLabel?: string }> = [
    { key: 'visitantes', label: 'Visitantes únicos' },
    { key: 'sesiones', label: 'Sesiones', stepLabel: 'desde visitas' },
    { key: 'contactos', label: 'Contactos nuevos', stepLabel: 'desde sesiones' },
    { key: 'muestras', label: 'Muestras solicitadas', stepLabel: 'desde contactos' },
    { key: 'checkouts', label: 'Checkouts iniciados', stepLabel: 'desde muestras' },
    { key: 'ventas', label: 'Ventas web', stepLabel: 'desde checkouts' },
    { key: 'ventasDerivadas', label: 'Ventas derivadas de web', stepLabel: 'desde ventas web' },
  ];
  const prevKeys: ComercialKpi['key'][] = [
    'visitantes',
    'sesiones',
    'contactos',
    'muestras',
    'checkouts',
    'ventas',
    'ventasDerivadas',
  ];
  return defs.map((def, i) => ({
    key: def.key,
    label: def.label,
    value: input.current[def.key] ?? 0,
    previousValue: input.previous[def.key] ?? 0,
    funnelPreviousValue: i > 0 ? (input.current[prevKeys[i - 1]] ?? 0) : undefined,
    stepLabel: i > 0 ? def.stepLabel : undefined,
  }));
}

export function exportPotencialesCsv(
  mockups: MockupSinCompraRow[],
  ordenes: OrdenSeguimientoRow[],
  contactos: ContactoSinMuestraRow[],
): void {
  const headers = [
    'Tipo',
    'Fecha',
    'Nombre',
    'Teléfono',
    'Email',
    'Estado / Material',
    'Valor estimado',
    'Días pendiente',
    'Prioridad',
  ];
  const rows: string[][] = [];

  for (const m of mockups) {
    rows.push([
      'Mockup sin compra',
      m.createdAt,
      m.nombre,
      m.telefono ?? m.whatsapp ?? '',
      m.email ?? '',
      `${m.estado} · ${MATERIAL_LABELS[m.material] ?? m.material}`,
      m.cotizacionEstimada != null ? String(m.cotizacionEstimada) : '',
      String(m.diasSinCompra),
      PRIORIDAD_LABELS[m.prioridad],
    ]);
  }
  for (const o of ordenes) {
    rows.push([
      'Pago pendiente',
      o.createdAt,
      o.nombre,
      o.telefono ?? '',
      o.email ?? '',
      PAGO_ESTADO_LABELS[o.estadoPagoWeb] ?? o.estadoPagoWeb,
      o.valorTotal != null ? String(o.valorTotal) : '',
      String(o.diasPendiente),
      PRIORIDAD_LABELS[o.prioridad],
    ]);
  }
  for (const c of contactos) {
    rows.push([
      'Contacto sin muestra',
      c.createdAt,
      c.nombre,
      c.telefono,
      c.email ?? '',
      'Sin mockup',
      '',
      String(c.diasDesdeContacto),
      PRIORIDAD_LABELS[c.prioridad],
    ]);
  }

  downloadCsv(`potenciales-web-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

export function sortTimeline(events: ClienteTimelineEvent[]): ClienteTimelineEvent[] {
  return [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
