import { supabase } from '../client';

export type EnvioEventoTipo = 'csv_generado' | 'etiqueta_descargada' | 'etiqueta_reimpresa';

export type EnvioEventoRow = {
  id: string;
  orden_id: string;
  tipo_evento: EnvioEventoTipo;
  created_at: string;
  created_by: string | null;
  meta: Record<string, unknown> | null;
};

export type EnvioHistorialKind =
  | 'csv_generado'
  | 'etiqueta_descargada'
  | 'etiqueta_reimpresa'
  | 'datos_cargados'
  | 'estado_envio';

export type EnvioHistorialEntry = {
  id: string;
  ordenId: string;
  kind: EnvioHistorialKind;
  label: string;
  detail?: string;
  createdAt: string;
  customerName?: string;
  carrier?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function insertEnvioEventos(
  ordenIds: string[],
  tipoEvento: EnvioEventoTipo,
  meta?: Record<string, unknown> | null,
): Promise<void> {
  if (!ordenIds.length) return;

  const { data: authData } = await supabase.auth.getUser();
  const createdBy = authData.user?.id ?? null;

  const rows = ordenIds.map((ordenId) => ({
    orden_id: ordenId,
    tipo_evento: tipoEvento,
    created_by: createdBy,
    meta: meta ?? null,
  }));

  const { error } = await supabase.from('envio_eventos').insert(rows);
  if (error) {
    console.warn('No se pudieron registrar eventos de envío:', error.message);
  }
}

export async function insertEnvioEventoForOrden(
  ordenId: string,
  tipoEvento: EnvioEventoTipo,
  meta?: Record<string, unknown> | null,
): Promise<void> {
  await insertEnvioEventos([ordenId], tipoEvento, meta);
}

/** Etiqueta IDs (Andreani) ya descargadas, leídas desde envio_eventos.meta.etiqueta_id */
export async function getDownloadedAndreaniEtiquetaIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('envio_eventos')
    .select('meta')
    .eq('tipo_evento', 'etiqueta_descargada')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.warn('No se pudo leer historial de descargas Andreani:', error.message);
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.meta as { etiqueta_id?: unknown } | null;
    if (meta && typeof meta.etiqueta_id === 'string') {
      ids.add(meta.etiqueta_id);
    }
  }
  return ids;
}

function eventLabel(tipo: EnvioEventoTipo): string {
  switch (tipo) {
    case 'csv_generado':
      return 'CSV generado';
    case 'etiqueta_descargada':
      return 'Etiqueta descargada';
    case 'etiqueta_reimpresa':
      return 'Etiqueta reimpresa';
    default:
      return tipo;
  }
}

export async function fetchEnviosHistorialTimeline(options?: {
  limit?: number;
  search?: string;
  carrier?: 'ALL' | 'CORREO_ARGENTINO' | 'ANDREANI' | 'VIA_CARGO';
  kind?: EnvioHistorialKind | 'ALL';
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<EnvioHistorialEntry[]> {
  const limit = options?.limit ?? 200;
  const kind = options?.kind ?? 'ALL';
  const carrierFilter = options?.carrier ?? 'ALL';

  const entries: EnvioHistorialEntry[] = [];

  if (kind === 'ALL' || kind === 'csv_generado' || kind === 'etiqueta_descargada' || kind === 'etiqueta_reimpresa') {
    let eventosQuery = supabase
      .from('envio_eventos')
      .select('id, orden_id, tipo_evento, created_at, created_by, meta')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (kind !== 'ALL') {
      eventosQuery = eventosQuery.eq('tipo_evento', kind);
    }
    if (options?.fromDate) {
      eventosQuery = eventosQuery.gte('created_at', options.fromDate);
    }
    if (options?.toDate) {
      eventosQuery = eventosQuery.lte('created_at', options.toDate);
    }

    const { data: eventos, error: eventosError } = await eventosQuery;
    if (eventosError) throw eventosError;

    for (const row of (eventos ?? []) as EnvioEventoRow[]) {
      entries.push({
        id: `evt-${row.id}`,
        ordenId: row.orden_id,
        kind: row.tipo_evento,
        label: eventLabel(row.tipo_evento),
        createdAt: row.created_at,
        meta: row.meta,
      });
    }
  }

  if (kind === 'ALL' || kind === 'estado_envio') {
    let histQuery = supabase
      .from('estado_historial')
      .select('id, orden_id, estado_anterior, estado_nuevo, changed_at')
      .eq('campo', 'estado_envio')
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (options?.fromDate) {
      histQuery = histQuery.gte('changed_at', options.fromDate);
    }
    if (options?.toDate) {
      histQuery = histQuery.lte('changed_at', options.toDate);
    }

    const { data: hist, error: histError } = await histQuery;
    if (histError) throw histError;

    for (const row of hist ?? []) {
      entries.push({
        id: `hist-${row.id}`,
        ordenId: row.orden_id,
        kind: 'estado_envio',
        label: 'Cambio de estado de envío',
        detail: [row.estado_anterior, row.estado_nuevo].filter(Boolean).join(' → ') || undefined,
        createdAt: row.changed_at,
      });
    }
  }

  if (kind === 'ALL' || kind === 'datos_cargados') {
    let datosQuery = supabase
      .from('ordenes')
      .select('id, envio_datos_cargado_at, empresa_envio, clientes(nombre, apellido)')
      .not('envio_datos_cargado_at', 'is', null)
      .order('envio_datos_cargado_at', { ascending: false })
      .limit(limit);

    if (options?.fromDate) {
      datosQuery = datosQuery.gte('envio_datos_cargado_at', options.fromDate);
    }
    if (options?.toDate) {
      datosQuery = datosQuery.lte('envio_datos_cargado_at', options.toDate);
    }

    const { data: datos, error: datosError } = await datosQuery;
    if (datosError) throw datosError;

    for (const row of datos ?? []) {
      const cliente = row.clientes as { nombre?: string; apellido?: string } | null;
      const name = cliente
        ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim()
        : undefined;
      entries.push({
        id: `datos-${row.id}`,
        ordenId: row.id,
        kind: 'datos_cargados',
        label: 'Datos de envío cargados',
        createdAt: row.envio_datos_cargado_at as string,
        customerName: name,
        carrier: row.empresa_envio,
      });
    }
  }

  // Enriquecer con cliente / empresa para entradas que no lo traen
  const ordenIdsNeedingInfo = [
    ...new Set(
      entries.filter((e) => !e.customerName || e.carrier === undefined).map((e) => e.ordenId),
    ),
  ];

  if (ordenIdsNeedingInfo.length) {
    const { data: ordenes } = await supabase
      .from('ordenes')
      .select('id, empresa_envio, clientes(nombre, apellido)')
      .in('id', ordenIdsNeedingInfo);

    const byId = new Map(
      (ordenes ?? []).map((o) => {
        const cliente = o.clientes as { nombre?: string; apellido?: string } | null;
        const name = cliente
          ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim()
          : undefined;
        return [o.id, { name, carrier: o.empresa_envio as string | null }];
      }),
    );

    for (const entry of entries) {
      const info = byId.get(entry.ordenId);
      if (!info) continue;
      if (!entry.customerName) entry.customerName = info.name;
      if (entry.carrier === undefined) entry.carrier = info.carrier;
    }
  }

  const carrierDbMap: Record<string, string> = {
    CORREO_ARGENTINO: 'Correo Argentino',
    ANDREANI: 'Andreani',
    VIA_CARGO: 'Via Cargo',
  };

  let filtered = entries;

  if (carrierFilter !== 'ALL') {
    const dbName = carrierDbMap[carrierFilter];
    filtered = filtered.filter((e) => e.carrier === dbName);
  }

  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter((e) => {
      const hay = `${e.customerName || ''} ${e.ordenId} ${e.label} ${e.detail || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return filtered.slice(0, limit);
}
