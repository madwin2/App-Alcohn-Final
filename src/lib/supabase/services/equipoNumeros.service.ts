import { supabase } from '../client';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';
import { storageFileKindFromUrl } from '@/lib/utils/storageFileKind';
import {
  clampRangoHastaHoy,
  conteoSellosPeriodo,
  esAreaProduccion,
  galeriaEnviosDisponible,
  ordenarSellosPorRecencia,
  paginarIds,
  rangoPeriodo,
  rangoPeriodoAnterior,
  rangoToUtcBounds,
  serieMensualSellos,
  textoComparacion,
  labelPeriodoAnterior,
  labelPeriodoActual,
  ultimosNMeses,
  type EventoSelloHistorial,
  type PeriodoNumeros,
  type RangoFecha,
} from '@/lib/equipo/misNumeros';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import type { AreaPrincipalEquipo } from './equipo.service';

const PAGE_SIZE_HISTORIAL = 1000;
const GALERIA_PAGE_DEFAULT = 24;

export type MetricCard = {
  key: string;
  titulo: string;
  valor: number;
  comparacion: string;
  detalle?: string;
};

export type GaleriaItem = {
  selloId: string;
  ordenId: string;
  diseno: string;
  clienteNombre: string;
  fecha: string;
  thumbUrl: string | null;
  esPrueba: boolean;
};

export type MisNumerosSnapshot = {
  periodo: PeriodoNumeros;
  labelPeriodo: string;
  esProduccion: boolean;
  metricas: MetricCard[];
  /** Últimos 6 meses (producción: Hecho; si no: datos de envío cargados). */
  serie6Meses: Array<{ key: string; label: string; value: number }>;
  serieTitulo: string;
  galeriaModo: 'produccion' | 'envios' | 'pronto';
};

type HistorialRow = {
  sello_id: string | null;
  orden_id: string;
  changed_at: string;
  ordenes?: { tipo_pedido?: string | null } | { tipo_pedido?: string | null }[] | null;
};

async function fetchAllHistorial(
  campo: 'estado_fabricacion' | 'estado_vectorizacion',
  estadoNuevo: string,
  rango: RangoFecha,
): Promise<EventoSelloHistorial[]> {
  const { gte, lt } = rangoToUtcBounds(rango);
  const out: EventoSelloHistorial[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('estado_historial')
      .select('sello_id, orden_id, changed_at, ordenes(tipo_pedido)')
      .eq('campo', campo)
      .eq('estado_nuevo', estadoNuevo)
      .not('sello_id', 'is', null)
      .gte('changed_at', gte)
      .lt('changed_at', lt)
      .order('changed_at', { ascending: false })
      .range(from, from + PAGE_SIZE_HISTORIAL - 1);

    if (error) throw error;
    const rows = (data ?? []) as HistorialRow[];
    for (const row of rows) {
      if (!row.sello_id) continue;
      const orden = Array.isArray(row.ordenes) ? row.ordenes[0] : row.ordenes;
      out.push({
        selloId: row.sello_id,
        ordenId: row.orden_id,
        changedAt: row.changed_at,
        tipoPedido: orden?.tipo_pedido ?? null,
      });
    }
    if (rows.length < PAGE_SIZE_HISTORIAL) break;
    from += PAGE_SIZE_HISTORIAL;
  }

  return out;
}

async function countOrdenesEnvioDatos(userId: string, rango: RangoFecha): Promise<number> {
  const { gte, lt } = rangoToUtcBounds(rango);
  const { count, error } = await supabase
    .from('ordenes')
    .select('id', { count: 'exact', head: true })
    .eq('envio_datos_cargado_por', userId)
    .gte('envio_datos_cargado_at', gte)
    .lt('envio_datos_cargado_at', lt);
  if (error) throw error;
  return count ?? 0;
}

async function countEnvioEventos(
  userId: string,
  rango: RangoFecha,
  tipos: string[],
): Promise<number> {
  const { gte, lt } = rangoToUtcBounds(rango);
  const { count, error } = await supabase
    .from('envio_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .in('tipo_evento', tipos)
    .gte('created_at', gte)
    .lt('created_at', lt);
  if (error) throw error;
  return count ?? 0;
}

async function fetchEnvioDatosMensual(
  userId: string,
  meses: Array<{ key: string; rango: RangoFecha }>,
): Promise<Array<{ key: string; value: number }>> {
  if (meses.length === 0) return [];
  const desde = meses[0].rango.desde;
  const hasta = meses[meses.length - 1].rango.hasta;
  const { gte, lt } = rangoToUtcBounds({ desde, hasta });

  const { data, error } = await supabase
    .from('ordenes')
    .select('id, envio_datos_cargado_at')
    .eq('envio_datos_cargado_por', userId)
    .gte('envio_datos_cargado_at', gte)
    .lt('envio_datos_cargado_at', lt);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; envio_datos_cargado_at: string | null }>;
  return meses.map((m) => {
    const bounds = rangoToUtcBounds(m.rango);
    const gteMs = new Date(bounds.gte).getTime();
    const ltMs = new Date(bounds.lt).getTime();
    let value = 0;
    for (const r of rows) {
      if (!r.envio_datos_cargado_at) continue;
      const t = new Date(r.envio_datos_cargado_at).getTime();
      if (t >= gteMs && t < ltMs) value += 1;
    }
    return { key: m.key, value };
  });
}

function metric(
  key: string,
  titulo: string,
  actual: number,
  anterior: number,
  labelAnt: string,
  detalle?: string,
): MetricCard {
  return {
    key,
    titulo,
    valor: actual,
    comparacion: textoComparacion(actual, anterior, labelAnt),
    detalle,
  };
}

/**
 * Snapshot de métricas para la pestaña Mis números.
 * Producción (D11): todos los Hecho/VECTORIZADO se atribuyen al área producción.
 * Envíos: solo lo hecho por `userId` (D10).
 */
export async function getMisNumerosSnapshot(params: {
  userId: string;
  areaPrincipal: AreaPrincipalEquipo | null;
  periodo: PeriodoNumeros;
  hoy?: string;
}): Promise<MisNumerosSnapshot> {
  const hoy = params.hoy ?? todayArgentinaDateKey();
  const periodo = params.periodo;
  const esProduccion = esAreaProduccion(params.areaPrincipal);
  const actual = clampRangoHastaHoy(rangoPeriodo(periodo, hoy), hoy);
  const anterior = rangoPeriodoAnterior(periodo, hoy);
  const labelAnt = labelPeriodoAnterior(periodo, hoy);
  const meses = ultimosNMeses(hoy, 6);
  const metricas: MetricCard[] = [];

  let serie6Meses: MisNumerosSnapshot['serie6Meses'] = [];
  let serieTitulo = 'Últimos 6 meses';

  // Ampliar fetch a cubrir actual + anterior + 6 meses
  const fetchDesde = [...meses.map((m) => m.rango.desde), actual.desde, anterior.desde].sort()[0];
  const fetchHasta = hoy;

  if (esProduccion) {
    const hechos = await fetchAllHistorial('estado_fabricacion', 'Hecho', {
      desde: fetchDesde,
      hasta: fetchHasta,
    });
    const cActual = conteoSellosPeriodo(hechos, actual);
    const cAnterior = conteoSellosPeriodo(hechos, anterior);
    metricas.push(
      metric(
        'sellos_hecho',
        'Sellos terminados',
        cActual.total,
        cAnterior.total,
        labelAnt,
        cActual.pruebas > 0 ? `${cActual.pruebas} de pedidos Prueba` : undefined,
      ),
    );

    const vect = await fetchAllHistorial('estado_vectorizacion', 'VECTORIZADO', {
      desde: fetchDesde,
      hasta: fetchHasta,
    });
    const vActual = conteoSellosPeriodo(vect, actual).total;
    const vAnterior = conteoSellosPeriodo(vect, anterior).total;
    metricas.push(metric('vectorizados', 'Sellos vectorizados', vActual, vAnterior, labelAnt));

    serie6Meses = serieMensualSellos(hechos, meses);
    serieTitulo = 'Sellos terminados · últimos 6 meses';
  }

  const [envAct, envAnt, etiqAct, etiqAnt] = await Promise.all([
    countOrdenesEnvioDatos(params.userId, actual),
    countOrdenesEnvioDatos(params.userId, anterior),
    countEnvioEventos(params.userId, actual, ['csv_generado', 'etiqueta_descargada']),
    countEnvioEventos(params.userId, anterior, ['csv_generado', 'etiqueta_descargada']),
  ]);

  metricas.push(
    metric('envio_datos', 'Datos de envío cargados', envAct, envAnt, labelAnt),
  );
  metricas.push(
    metric('etiquetas', 'Etiquetas generadas / descargadas', etiqAct, etiqAnt, labelAnt),
  );

  if (!esProduccion) {
    const mensuales = await fetchEnvioDatosMensual(params.userId, meses);
    serie6Meses = meses.map((m) => {
      const found = mensuales.find((x) => x.key === m.key);
      return { key: m.key, label: m.label, value: found?.value ?? 0 };
    });
    serieTitulo = 'Datos de envío cargados · últimos 6 meses';
  }

  let galeriaModo: MisNumerosSnapshot['galeriaModo'] = 'pronto';
  if (esProduccion) galeriaModo = 'produccion';
  else if (galeriaEnviosDisponible()) galeriaModo = 'envios';

  return {
    periodo,
    labelPeriodo: labelPeriodoActual(periodo, hoy),
    esProduccion,
    metricas,
    serie6Meses,
    serieTitulo,
    galeriaModo,
  };
}

async function resolveThumbUrl(
  fotoSello: string | null | undefined,
  vectorPreview: string | null | undefined,
): Promise<string | null> {
  const candidates = [fotoSello, vectorPreview].filter(
    (u): u is string => Boolean(u && String(u).trim()),
  );
  for (const url of candidates) {
    const kind = storageFileKindFromUrl(url);
    if (kind !== 'image' && kind !== 'svg') continue;
    try {
      const display = await resolveStorageDisplayUrl(url);
      if (display) return display;
    } catch {
      // probar siguiente
    }
  }
  // Si foto_sello es pública y no pasó el filtro de kind, intentar igual
  if (fotoSello?.trim()) {
    try {
      return await resolveStorageDisplayUrl(fotoSello);
    } catch {
      return fotoSello;
    }
  }
  return null;
}

type SelloGaleriaRow = {
  id: string;
  orden_id: string;
  diseno: string | null;
  foto_sello: string | null;
  archivo_vector_preview: string | null;
  ordenes?: {
    tipo_pedido?: string | null;
    clientes?: { nombre?: string | null; apellido?: string | null } | null;
  } | null;
};

function clienteLabel(
  c: { nombre?: string | null; apellido?: string | null } | null | undefined,
): string {
  if (!c) return 'Cliente';
  const n = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
  return n || 'Cliente';
}

async function mapSellosGaleria(
  rows: SelloGaleriaRow[],
  fechaPorSello: Map<string, string>,
): Promise<GaleriaItem[]> {
  const items: GaleriaItem[] = [];
  for (const row of rows) {
    const orden = row.ordenes;
    const thumbUrl = await resolveThumbUrl(row.foto_sello, row.archivo_vector_preview);
    items.push({
      selloId: row.id,
      ordenId: row.orden_id,
      diseno: row.diseno?.trim() || 'Sin diseño',
      clienteNombre: clienteLabel(orden?.clientes ?? null),
      fecha: fechaPorSello.get(row.id) ?? '',
      thumbUrl,
      esPrueba: orden?.tipo_pedido === 'Prueba',
    });
  }
  return items;
}

/**
 * Galería de sellos terminados (área producción) en el período.
 * Paginada; URLs de display resueltas (públicas o firmadas).
 */
export async function getGaleriaProduccion(params: {
  periodo: PeriodoNumeros;
  offset?: number;
  limit?: number;
  hoy?: string;
}): Promise<{ items: GaleriaItem[]; total: number; hasMore: boolean }> {
  const hoy = params.hoy ?? todayArgentinaDateKey();
  const rango = clampRangoHastaHoy(rangoPeriodo(params.periodo, hoy), hoy);
  const limit = params.limit ?? GALERIA_PAGE_DEFAULT;
  const offset = params.offset ?? 0;

  const hechos = await fetchAllHistorial('estado_fabricacion', 'Hecho', rango);
  const orderedIds = ordenarSellosPorRecencia(hechos, rango);
  const total = orderedIds.length;
  const pageIds = paginarIds(orderedIds, offset, limit);

  if (pageIds.length === 0) {
    return { items: [], total, hasMore: false };
  }

  const fechaPorSello = new Map<string, string>();
  for (const e of hechos) {
    if (!fechaPorSello.has(e.selloId) || e.changedAt > (fechaPorSello.get(e.selloId) ?? '')) {
      fechaPorSello.set(e.selloId, e.changedAt);
    }
  }

  const { data, error } = await supabase
    .from('sellos')
    .select(
      'id, orden_id, diseno, foto_sello, archivo_vector_preview, ordenes(tipo_pedido, clientes(nombre, apellido))',
    )
    .in('id', pageIds);

  if (error) throw error;

  const byId = new Map((data as SelloGaleriaRow[] | null)?.map((r) => [r.id, r]) ?? []);
  const orderedRows = pageIds.map((id) => byId.get(id)).filter(Boolean) as SelloGaleriaRow[];
  const items = await mapSellosGaleria(orderedRows, fechaPorSello);

  return { items, total, hasMore: offset + pageIds.length < total };
}

/**
 * Galería de sellos de pedidos cuyo envío cargó el usuario (`envio_datos_cargado_por`).
 * Atribución real (D10 / Etapa 7).
 */
export async function getGaleriaEnvios(params: {
  userId: string;
  periodo: PeriodoNumeros;
  offset?: number;
  limit?: number;
  hoy?: string;
}): Promise<{ items: GaleriaItem[]; total: number; hasMore: boolean }> {
  const hoy = params.hoy ?? todayArgentinaDateKey();
  const rango = clampRangoHastaHoy(rangoPeriodo(params.periodo, hoy), hoy);
  const { gte, lt } = rangoToUtcBounds(rango);
  const limit = params.limit ?? GALERIA_PAGE_DEFAULT;
  const offset = params.offset ?? 0;

  const { data: ordenes, error: ordErr } = await supabase
    .from('ordenes')
    .select('id, envio_datos_cargado_at, tipo_pedido, clientes(nombre, apellido)')
    .eq('envio_datos_cargado_por', params.userId)
    .gte('envio_datos_cargado_at', gte)
    .lt('envio_datos_cargado_at', lt)
    .order('envio_datos_cargado_at', { ascending: false });

  if (ordErr) throw ordErr;

  type OrdenRow = {
    id: string;
    envio_datos_cargado_at: string | null;
    tipo_pedido?: string | null;
    clientes?: { nombre?: string | null; apellido?: string | null } | null;
  };
  const ordenList = (ordenes ?? []) as OrdenRow[];
  if (ordenList.length === 0) {
    return { items: [], total: 0, hasMore: false };
  }

  const ordenIds = ordenList.map((o) => o.id);
  const ordenMap = new Map(ordenList.map((o) => [o.id, o]));

  const { data: sellos, error: selErr } = await supabase
    .from('sellos')
    .select('id, orden_id, diseno, foto_sello, archivo_vector_preview')
    .in('orden_id', ordenIds);

  if (selErr) throw selErr;

  type SelloRow = {
    id: string;
    orden_id: string;
    diseno: string | null;
    foto_sello: string | null;
    archivo_vector_preview: string | null;
  };

  const allSellos = (sellos ?? []) as SelloRow[];
  // Ordenar por fecha de carga de envío de la orden (desc), luego id
  allSellos.sort((a, b) => {
    const ta = ordenMap.get(a.orden_id)?.envio_datos_cargado_at ?? '';
    const tb = ordenMap.get(b.orden_id)?.envio_datos_cargado_at ?? '';
    if (ta < tb) return 1;
    if (ta > tb) return -1;
    return a.id.localeCompare(b.id);
  });

  const total = allSellos.length;
  const page = allSellos.slice(offset, offset + limit);

  const fechaPorSello = new Map<string, string>();
  const rows: SelloGaleriaRow[] = page.map((s) => {
    const o = ordenMap.get(s.orden_id);
    if (o?.envio_datos_cargado_at) fechaPorSello.set(s.id, o.envio_datos_cargado_at);
    return {
      ...s,
      ordenes: {
        tipo_pedido: o?.tipo_pedido ?? null,
        clientes: o?.clientes ?? null,
      },
    };
  });

  const items = await mapSellosGaleria(rows, fechaPorSello);
  return { items, total, hasMore: offset + page.length < total };
}
