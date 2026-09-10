import { supabase } from '../client';
import type { ItemType, ShippingCarrier } from '@/lib/types';
import { mapShippingCarrier } from '../mappers';
import { getEstadoHistorialByOrdenId } from './estadoHistorial.service';
import { getItemTypeLabel, getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { normalizePhoneDigits, stripAccents } from '@/lib/utils/shippingNormalization';

export const ENVIOS_HISTORIAL_PAGE_SIZE = 50;
export const ENVIOS_HISTORIAL_SEARCH_PAGE_SIZE = 300;

const PHONE_SEARCH_RE = /^\+?\d[\d\s-]*$/;

export interface EnvioHistorialRow {
  ordenId: string;
  createdAt: string | null;
  customerName: string;
  customerPhone: string | null;
  designLabel: string;
  previewUrl: string | null;
  previewMockupSolicitudId: string | null;
  trackingNumber: string | null;
  carrier: ShippingCarrier | null;
  shippingType: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
  seguimientoEnviadoAt: string | null;
  itemsSummary: string;
  itemCount: number;
  andreaniPdfPath: string | null;
  andreaniEtiquetaId: string | null;
}

export interface EnvioHistorialDetailItem {
  label: string;
  kind: 'sello' | 'complemento';
}

export interface EnvioHistorialDetail {
  carrier: ShippingCarrier | null;
  shippingType: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
  recipientName: string | null;
  address: {
    domicilio: string | null;
    localidad: string | null;
    provincia: string | null;
    codigoPostal: string | null;
    sucursalCodigo: string | null;
  } | null;
  items: EnvioHistorialDetailItem[];
  timeline: Array<{ estadoAnterior: string | null; estadoNuevo: string | null; changedAt: string }>;
  pdfDownloads: Array<{ tipoEvento: 'etiqueta_descargada' | 'etiqueta_reimpresa'; createdAt: string }>;
}

type ClienteLite = {
  nombre?: string | null;
  apellido?: string | null;
  telefono?: string | null;
};

type DireccionLite = {
  telefono?: string | null;
};

type SelloLite = {
  diseno?: string | null;
  tipo?: string | null;
  item_type?: ItemType | null;
  item_config?: Record<string, unknown> | null;
  archivo_base?: string | null;
  archivo_vector_preview?: string | null;
  foto_sello?: string | null;
  mockup_solicitud_id?: string | null;
};

type EtiquetaLite = {
  id?: string | null;
  pdf_path?: string | null;
};

type OrdenHistorialQueryRow = {
  id: string;
  created_at: string | null;
  seguimiento: string | null;
  empresa_envio: string | null;
  tipo_envio: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
  seguimiento_enviado_at: string | null;
  clientes: ClienteLite | ClienteLite[] | null;
  direcciones: DireccionLite | DireccionLite[] | null;
  sellos: SelloLite[] | SelloLite | null;
  envios_andreani_etiquetas: EtiquetaLite[] | EtiquetaLite | null;
};

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asMany<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function looksLikePhoneSearch(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 6) return false;
  return PHONE_SEARCH_RE.test(trimmed);
}

function toDisplayItem(sello: SelloLite) {
  return {
    designName: sello.diseno || 'Sin diseño',
    itemType: (sello.item_type as ItemType) || 'SELLO',
    itemConfig: sello.item_config as { soldadorPower?: '100W' | '200W' } | undefined,
  };
}

function pickRepresentativeSello(sellos: SelloLite[]): SelloLite | null {
  if (!sellos.length) return null;
  return (
    sellos.find((item) => item.archivo_base || item.archivo_vector_preview) || sellos[0]
  );
}

function buildItemsSummary(sellos: SelloLite[]): string {
  const counts = new Map<string, number>();
  for (const sello of sellos) {
    const name = getOrderItemDisplayName(toDisplayItem(sello));
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, n]) => `${n}× ${name}`).join(', ');
}

const STAMP_TYPE_LABEL: Record<string, string> = {
  Clasico: 'clásico',
  '3mm': '3mm',
  Lacre: 'lacre',
  Alimento: 'alimento',
  ABC: 'abecedario',
};

function describeSello(sello: SelloLite): EnvioHistorialDetailItem {
  const itemType = (sello.item_type as ItemType) || 'SELLO';
  if (itemType === 'SELLO') {
    const tipo = STAMP_TYPE_LABEL[sello.tipo || ''] || 'sello';
    const name = sello.diseno?.trim();
    const hasName = Boolean(name && name.toLowerCase() !== 'sin diseño');
    return {
      kind: 'sello',
      label: hasName ? `Sello ${tipo}: ${name}` : `Sello ${tipo}`,
    };
  }
  if (itemType === 'SOLDADOR') {
    const power = (sello.item_config as { soldadorPower?: string } | null)?.soldadorPower;
    return {
      kind: 'complemento',
      label: power ? `Soldador ${power}` : 'Soldador',
    };
  }
  return {
    kind: 'complemento',
    label: getItemTypeLabel(itemType),
  };
}

function pickAndreaniEtiqueta(etiquetas: EtiquetaLite[]): EtiquetaLite | null {
  return etiquetas.find((row) => row.pdf_path) || etiquetas[0] || null;
}

function mapOrdenToHistorialRow(row: OrdenHistorialQueryRow): EnvioHistorialRow {
  const cliente = asOne(row.clientes);
  const direccion = asOne(row.direcciones);
  const sellos = asMany(row.sellos);
  const etiquetas = asMany(row.envios_andreani_etiquetas);
  const representative = pickRepresentativeSello(sellos);
  const etiqueta = pickAndreaniEtiqueta(etiquetas);

  const customerName = [cliente?.nombre, cliente?.apellido].filter(Boolean).join(' ').trim() || 'Sin cliente';
  const rawPhone = cliente?.telefono || direccion?.telefono || null;
  const customerPhone = rawPhone ? normalizePhoneDigits(rawPhone) || null : null;

  return {
    ordenId: row.id,
    createdAt: row.created_at,
    customerName,
    customerPhone,
    designLabel: representative ? getOrderItemDisplayName(toDisplayItem(representative)) : 'Sin diseño',
    previewUrl: representative?.archivo_base || representative?.archivo_vector_preview || null,
    previewMockupSolicitudId: representative?.mockup_solicitud_id ?? null,
    trackingNumber: row.seguimiento,
    carrier: mapShippingCarrier(row.empresa_envio),
    shippingType: row.tipo_envio ?? null,
    seguimientoEnviadoAt: row.seguimiento_enviado_at,
    itemsSummary: buildItemsSummary(sellos) || '—',
    itemCount: sellos.length,
    andreaniPdfPath: etiqueta?.pdf_path ?? null,
    andreaniEtiquetaId: etiqueta?.id ?? null,
  };
}

function rowMatchesSearch(row: EnvioHistorialRow, search: string): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;

  if (looksLikePhoneSearch(trimmed)) {
    const qDigits = normalizePhoneDigits(trimmed);
    if (!qDigits) return false;
    return Boolean(row.customerPhone && row.customerPhone.includes(qDigits));
  }

  const q = stripAccents(trimmed.toLowerCase());
  const haystack = stripAccents(
    [
      row.customerName,
      row.designLabel,
      row.itemsSummary,
      row.trackingNumber ?? '',
      row.customerPhone ?? '',
    ]
      .join(' ')
      .toLowerCase(),
  );
  return haystack.includes(q);
}

export async function fetchEnviosHistorial(options: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: EnvioHistorialRow[]; hasMore: boolean }> {
  const search = options.search?.trim() ?? '';
  const isSearch = Boolean(search);
  const limit = options.limit ?? (isSearch ? ENVIOS_HISTORIAL_SEARCH_PAGE_SIZE : ENVIOS_HISTORIAL_PAGE_SIZE);
  const offset = options.offset ?? 0;

  const { data, error } = await supabase
    .from('ordenes')
    .select(
      `
      id,
      created_at,
      seguimiento,
      empresa_envio,
      tipo_envio,
      seguimiento_enviado_at,
      clientes ( nombre, apellido, telefono ),
      direcciones ( telefono ),
      sellos ( diseno, tipo, item_type, item_config, archivo_base, archivo_vector_preview, foto_sello, mockup_solicitud_id ),
      envios_andreani_etiquetas ( id, pdf_path )
    `,
    )
    .eq('estado_envio', 'Seguimiento Enviado')
    .order('seguimiento_enviado_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const mapped = ((data ?? []) as unknown as OrdenHistorialQueryRow[]).map(mapOrdenToHistorialRow);
  const rows = isSearch ? mapped.filter((row) => rowMatchesSearch(row, search)) : mapped;
  return {
    rows,
    hasMore: (data?.length ?? 0) === limit,
  };
}

export async function fetchEnvioHistorialDetail(ordenId: string): Promise<EnvioHistorialDetail> {
  const [{ data: orden, error: ordenError }, timelineDesc, { data: eventos, error: eventosError }] =
    await Promise.all([
      supabase
        .from('ordenes')
        .select(
          `
          tipo_envio,
          empresa_envio,
          direcciones (
            nombre,
            apellido,
            domicilio,
            localidad,
            provincia,
            codigo_postal,
            codigo_sucursal_micorreo
          ),
          sellos ( diseno, tipo, item_type, item_config )
        `,
        )
        .eq('id', ordenId)
        .maybeSingle(),
      getEstadoHistorialByOrdenId(ordenId, { campo: 'estado_orden' }),
      supabase
        .from('envio_eventos')
        .select('tipo_evento, created_at')
        .eq('orden_id', ordenId)
        .in('tipo_evento', ['etiqueta_descargada', 'etiqueta_reimpresa'])
        .order('created_at', { ascending: false }),
    ]);

  if (ordenError) throw ordenError;
  if (eventosError) throw eventosError;

  const shippingType = (orden?.tipo_envio as EnvioHistorialDetail['shippingType']) ?? null;
  const direccion = asOne(
    orden?.direcciones as
      | {
          nombre?: string | null;
          apellido?: string | null;
          domicilio?: string | null;
          localidad?: string | null;
          provincia?: string | null;
          codigo_postal?: string | null;
          codigo_sucursal_micorreo?: string | null;
        }
      | Array<{
          nombre?: string | null;
          apellido?: string | null;
          domicilio?: string | null;
          localidad?: string | null;
          provincia?: string | null;
          codigo_postal?: string | null;
          codigo_sucursal_micorreo?: string | null;
        }>
      | null,
  );

  const address =
    shippingType === 'Retiro' || !direccion
      ? null
      : {
          domicilio: direccion.domicilio ?? null,
          localidad: direccion.localidad ?? null,
          provincia: direccion.provincia ?? null,
          codigoPostal: direccion.codigo_postal ?? null,
          sucursalCodigo: direccion.codigo_sucursal_micorreo ?? null,
        };

  const recipientName = direccion
    ? [direccion.nombre, direccion.apellido].filter(Boolean).join(' ').trim() || null
    : null;

  const items = asMany(orden?.sellos as SelloLite[] | SelloLite | null).map(describeSello);

  const timeline = [...timelineDesc]
    .reverse()
    .map((entry) => ({
      estadoAnterior: entry.estadoAnterior,
      estadoNuevo: entry.estadoNuevo,
      changedAt: entry.changedAt,
    }));

  const pdfDownloads = (eventos ?? [])
    .filter(
      (row): row is { tipo_evento: 'etiqueta_descargada' | 'etiqueta_reimpresa'; created_at: string } =>
        row.tipo_evento === 'etiqueta_descargada' || row.tipo_evento === 'etiqueta_reimpresa',
    )
    .map((row) => ({
      tipoEvento: row.tipo_evento,
      createdAt: row.created_at,
    }));

  return {
    carrier: mapShippingCarrier((orden?.empresa_envio as string | null) ?? null),
    shippingType,
    recipientName,
    address,
    items,
    timeline,
    pdfDownloads,
  };
}

export async function hasEtiquetaPdfDownloaded(ordenId: string, etiquetaId: string | null): Promise<boolean> {
  if (!etiquetaId) return false;

  const { data, error } = await supabase
    .from('envio_eventos')
    .select('id, meta')
    .eq('orden_id', ordenId)
    .eq('tipo_evento', 'etiqueta_descargada')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('No se pudo consultar descargas previas de etiqueta:', error.message);
    return false;
  }

  return (data ?? []).some((row) => {
    const meta = row.meta as { etiqueta_id?: unknown } | null;
    return meta && typeof meta.etiqueta_id === 'string' && meta.etiqueta_id === etiquetaId;
  });
}
