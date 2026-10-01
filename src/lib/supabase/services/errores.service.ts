import { supabase } from '../client';
import {
  REHACER_MOTIVO_LABELS,
  REHACER_MOTIVOS,
  labelRehacerMotivo,
  type RehacerMotivo,
} from './rehacer.service';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { toArgentinaMonthKey } from '@/lib/utils/argentinaDate';

export const ERRORES_PAGE_SIZE = 50;

export type ErrorMotivoFilter = RehacerMotivo | 'ALL';

export interface ErroresListFilters {
  search?: string;
  motivo?: ErrorMotivoFilter;
  /** Solo eventos sin descripción (o solo espacios). */
  sinDescripcion?: boolean;
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
  offset?: number;
}

export interface ErrorEventoRow {
  id: string;
  selloId: string;
  ordenId: string;
  motivo: string;
  motivoLabel: string;
  descripcion: string | null;
  createdAt: string;
  createdByNombre: string | null;
  clienteNombre: string | null;
  disenoNombre: string;
  cobroMonto: number | null;
  cobroConcepto: string | null;
  hasBaseSnapshot: boolean;
  hasVectorSnapshot: boolean;
  hasFotoPrevia: boolean;
  archivoBaseSnapshot: string | null;
  archivoVectorSnapshot: string | null;
  archivoBaseMejoradoSnapshot: string | null;
  fotoSelloPrevio: string | null;
  anchoRealPrevio: string | null;
  largoRealPrevio: string | null;
  anchoFabricacionMmPrevio: number | null;
  largoFabricacionMmPrevio: number | null;
  programaIdPrevio: string | null;
  programaNombrePrevio: string | null;
  fabricacionEstadoPrevio: string | null;
  ventaEstadoPrevio: string | null;
}

export interface ErroresListResult {
  rows: ErrorEventoRow[];
  hasMore: boolean;
}

export interface ErroresMetricas {
  totalEnPeriodo: number;
  sinDescripcion: number;
  conCobro: number;
  /** Rehaceres por causa interna (máquina / medida / vector / Aspire). */
  internos: number;
  /** Rehaceres por reclamo o daño en envío. */
  externos: number;
  /** Motivo OTRO u otros. */
  otros: number;
  porMotivo: Array<{ motivo: string; label: string; count: number; pct: number }>;
  porMes: Array<{ monthKey: string; count: number }>;
  porUsuario: Array<{ userId: string; nombre: string; count: number }>;
  conSnapshotVector: number;
  conSnapshotBase: number;
  itemsSelloEnPeriodo: number | null;
  /** Rehaceres / ítems sello creados en el período (aproximación de tasa). */
  tasaVsItems: number | null;
}

const MOTIVOS_INTERNOS = new Set<string>([
  'ERROR_DETECTADO_EN_MAQUINA',
  'ERROR_EN_LA_MEDIDA',
  'ERROR_EN_EL_VECTOR',
  'ERROR_EN_PROGRAMACION_ASPIRE',
  'ERROR_MEDIDA_O_VECTOR', // histórico
]);
const MOTIVOS_EXTERNOS = new Set<string>([
  'RECLAMO_CLIENTE_PRE_ENTREGA',
  'RECLAMO_CLIENTE_POST_ENTREGA',
  'DANIO_O_ERROR_EN_ENVIO',
]);

type ClienteJoin = { nombre: string | null; apellido: string | null } | null;
type OrdenJoin = { clientes: ClienteJoin | ClienteJoin[] | null } | null;
type SelloJoin = {
  diseno: string | null;
  item_type: string | null;
  item_config: Record<string, unknown> | null;
  ordenes: OrdenJoin | OrdenJoin[] | null;
} | null;

const firstJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

function motivoLabel(motivo: string): string {
  return labelRehacerMotivo(motivo);
}

function hasDescripcionText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

function mapRow(
  row: Record<string, unknown>,
  userNames: Map<string, string>,
  programaNames: Map<string, string>,
): ErrorEventoRow {
  const sello = firstJoin(row.sellos as SelloJoin | SelloJoin[]);
  const orden = firstJoin(sello?.ordenes);
  const cliente = firstJoin(orden?.clientes);
  const clienteNombre = cliente
    ? `${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`.trim() || null
    : null;
  const createdBy = (row.created_by as string | null) ?? null;
  const programaId = (row.programa_id_previo as string | null) ?? null;

  return {
    id: row.id as string,
    selloId: row.sello_id as string,
    ordenId: row.orden_id as string,
    motivo: row.motivo as string,
    motivoLabel: motivoLabel(row.motivo as string),
    descripcion: (row.descripcion as string | null) ?? null,
    createdAt: row.created_at as string,
    createdByNombre: createdBy ? userNames.get(createdBy) ?? null : null,
    clienteNombre,
    disenoNombre: getOrderItemDisplayName({
      designName: sello?.diseno || '',
      itemType: (sello?.item_type as 'SELLO') || 'SELLO',
      itemConfig: sello?.item_config ?? undefined,
    }),
    cobroMonto:
      row.cobro_adicional_monto != null ? Number(row.cobro_adicional_monto) : null,
    cobroConcepto: (row.cobro_adicional_concepto as string | null) ?? null,
    hasBaseSnapshot: Boolean(row.archivo_base_snapshot),
    hasVectorSnapshot: Boolean(row.archivo_vector_snapshot),
    hasFotoPrevia: Boolean(row.foto_sello_previo),
    archivoBaseSnapshot: (row.archivo_base_snapshot as string | null) ?? null,
    archivoVectorSnapshot: (row.archivo_vector_snapshot as string | null) ?? null,
    archivoBaseMejoradoSnapshot:
      (row.archivo_base_mejorado_snapshot as string | null) ?? null,
    fotoSelloPrevio: (row.foto_sello_previo as string | null) ?? null,
    anchoRealPrevio: (row.ancho_real_previo as string | null) ?? null,
    largoRealPrevio: (row.largo_real_previo as string | null) ?? null,
    anchoFabricacionMmPrevio:
      row.ancho_fabricacion_mm_previo != null
        ? Number(row.ancho_fabricacion_mm_previo)
        : null,
    largoFabricacionMmPrevio:
      row.largo_fabricacion_mm_previo != null
        ? Number(row.largo_fabricacion_mm_previo)
        : null,
    programaIdPrevio: programaId,
    programaNombrePrevio: programaId ? programaNames.get(programaId) ?? null : null,
    fabricacionEstadoPrevio: (row.fabricacion_estado_previo as string | null) ?? null,
    ventaEstadoPrevio: (row.venta_estado_previo as string | null) ?? null,
  };
}

async function fetchUserNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('user_id, nombre, apellido, email')
    .in('user_id', unique)
    .eq('estado', 'APROBADO');
  if (error) {
    console.warn('No se pudieron cargar nombres de usuarios:', error);
    return map;
  }
  for (const user of data ?? []) {
    const name =
      user.nombre && user.apellido
        ? `${user.nombre} ${user.apellido}`
        : user.nombre || user.apellido || user.email || 'Usuario';
    map.set(user.user_id as string, name);
  }
  return map;
}

async function fetchProgramaNames(programaIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(programaIds.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabase
    .from('programa')
    .select('id, nombre')
    .in('id', unique);
  if (error) {
    console.warn('No se pudieron cargar nombres de programa:', error);
    return map;
  }
  for (const row of data ?? []) {
    map.set(row.id as string, (row.nombre as string) || row.id);
  }
  return map;
}

const EVENTO_SELECT = `
  id, sello_id, orden_id, motivo, descripcion, created_at, created_by,
  cobro_adicional_monto, cobro_adicional_concepto,
  archivo_base_snapshot, archivo_vector_snapshot, archivo_base_mejorado_snapshot,
  foto_sello_previo,
  ancho_real_previo, largo_real_previo,
  ancho_fabricacion_mm_previo, largo_fabricacion_mm_previo,
  programa_id_previo, fabricacion_estado_previo, venta_estado_previo,
  sellos (
    diseno, item_type, item_config,
    ordenes ( clientes ( nombre, apellido ) )
  )
`;

export async function fetchErroresList(
  filters: ErroresListFilters = {},
): Promise<ErroresListResult> {
  const limit = filters.limit ?? ERRORES_PAGE_SIZE;
  const offset = filters.offset ?? 0;
  const search = filters.search?.trim() ?? '';

  let query = supabase
    .from('sello_rehacer_eventos')
    .select(EVENTO_SELECT)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (filters.motivo && filters.motivo !== 'ALL') {
    query = query.eq('motivo', filters.motivo);
  }
  if (filters.fromIso) {
    query = query.gte('created_at', filters.fromIso);
  }
  if (filters.toIso) {
    query = query.lte('created_at', filters.toIso);
  }
  if (filters.sinDescripcion) {
    // PostgREST: null OR empty string
    query = query.or('descripcion.is.null,descripcion.eq.');
  }

  const { data, error } = await query;
  if (error) throw error;

  const raw = (data ?? []) as Record<string, unknown>[];
  const userNames = await fetchUserNames(
    raw.map((r) => (r.created_by as string | null) ?? '').filter(Boolean),
  );
  const programaNames = await fetchProgramaNames(
    raw.map((r) => (r.programa_id_previo as string | null) ?? '').filter(Boolean),
  );
  let rows = raw.map((r) => mapRow(r, userNames, programaNames));

  if (filters.sinDescripcion) {
    rows = rows.filter((r) => !hasDescripcionText(r.descripcion));
  }

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.clienteNombre ?? '').toLowerCase().includes(q) ||
        r.disenoNombre.toLowerCase().includes(q) ||
        r.motivoLabel.toLowerCase().includes(q) ||
        (r.descripcion ?? '').toLowerCase().includes(q) ||
        (r.createdByNombre ?? '').toLowerCase().includes(q),
    );
  }

  const hasMore = raw.length > limit;
  return { rows: rows.slice(0, limit), hasMore };
}

export async function updateErrorDescripcion(
  eventoId: string,
  descripcion: string,
): Promise<string | null> {
  const trimmed = descripcion.trim();
  const value = trimmed.length ? trimmed : null;
  const { error } = await supabase
    .from('sello_rehacer_eventos')
    .update({ descripcion: value })
    .eq('id', eventoId);
  if (error) throw error;
  return value;
}

export async function updateErrorMotivo(
  eventoId: string,
  motivo: RehacerMotivo,
): Promise<RehacerMotivo> {
  if (!REHACER_MOTIVOS.includes(motivo)) {
    throw new Error('Motivo inválido');
  }
  const { error } = await supabase
    .from('sello_rehacer_eventos')
    .update({ motivo })
    .eq('id', eventoId);
  if (error) throw error;
  return motivo;
}

export async function fetchErroresMetricas(params: {
  fromIso?: string | null;
  toIso?: string | null;
}): Promise<ErroresMetricas> {
  let query = supabase
    .from('sello_rehacer_eventos')
    .select(
      'id, motivo, descripcion, created_at, created_by, cobro_adicional_monto, archivo_base_snapshot, archivo_vector_snapshot',
    );

  if (params.fromIso) query = query.gte('created_at', params.fromIso);
  if (params.toIso) query = query.lte('created_at', params.toIso);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  const countByMotivo = new Map<string, number>();
  const countByMes = new Map<string, number>();
  const countByUser = new Map<string, number>();
  let conSnapshotVector = 0;
  let conSnapshotBase = 0;
  let sinDescripcion = 0;
  let conCobro = 0;
  let internos = 0;
  let externos = 0;
  let otros = 0;

  for (const row of rows) {
    const motivo = row.motivo as string;
    countByMotivo.set(motivo, (countByMotivo.get(motivo) ?? 0) + 1);
    const monthKey = toArgentinaMonthKey(row.created_at as string);
    countByMes.set(monthKey, (countByMes.get(monthKey) ?? 0) + 1);
    const userId = (row.created_by as string | null) ?? '';
    if (userId) countByUser.set(userId, (countByUser.get(userId) ?? 0) + 1);
    if (row.archivo_vector_snapshot) conSnapshotVector += 1;
    if (row.archivo_base_snapshot) conSnapshotBase += 1;
    if (!hasDescripcionText(row.descripcion as string | null)) sinDescripcion += 1;
    if (row.cobro_adicional_monto != null && Number(row.cobro_adicional_monto) > 0) {
      conCobro += 1;
    }
    if (MOTIVOS_INTERNOS.has(motivo)) internos += 1;
    else if (MOTIVOS_EXTERNOS.has(motivo)) externos += 1;
    else otros += 1;
  }

  const totalEnPeriodo = rows.length;

  const porMotivo: Array<{ motivo: string; label: string; count: number; pct: number }> =
    REHACER_MOTIVOS.map((motivo) => {
      const count = countByMotivo.get(motivo) ?? 0;
      return {
        motivo,
        label: motivoLabel(motivo),
        count,
        pct: totalEnPeriodo > 0 ? count / totalEnPeriodo : 0,
      };
    }).filter((m) => m.count > 0);

  for (const [motivo, count] of countByMotivo) {
    if (!REHACER_MOTIVOS.includes(motivo as RehacerMotivo)) {
      porMotivo.push({
        motivo,
        label: motivoLabel(motivo),
        count,
        pct: totalEnPeriodo > 0 ? count / totalEnPeriodo : 0,
      });
    }
  }
  porMotivo.sort((a, b) => b.count - a.count);

  const porMes = [...countByMes.entries()]
    .map(([monthKey, count]) => ({ monthKey, count }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const userNames = await fetchUserNames([...countByUser.keys()]);
  const porUsuario = [...countByUser.entries()]
    .map(([userId, count]) => ({
      userId,
      nombre: userNames.get(userId) || 'Usuario',
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let itemsSelloEnPeriodo: number | null = null;
  try {
    let itemsQuery = supabase
      .from('sellos')
      .select('id', { count: 'exact', head: true })
      .eq('item_type', 'SELLO');
    if (params.fromIso) itemsQuery = itemsQuery.gte('created_at', params.fromIso);
    if (params.toIso) itemsQuery = itemsQuery.lte('created_at', params.toIso);
    const { count, error: itemsError } = await itemsQuery;
    if (!itemsError) itemsSelloEnPeriodo = count ?? 0;
  } catch {
    itemsSelloEnPeriodo = null;
  }

  const tasaVsItems =
    itemsSelloEnPeriodo != null && itemsSelloEnPeriodo > 0
      ? totalEnPeriodo / itemsSelloEnPeriodo
      : null;

  return {
    totalEnPeriodo,
    sinDescripcion,
    conCobro,
    internos,
    externos,
    otros,
    porMotivo,
    porMes,
    porUsuario,
    conSnapshotVector,
    conSnapshotBase,
    itemsSelloEnPeriodo,
    tasaVsItems,
  };
}

export { REHACER_MOTIVOS, REHACER_MOTIVO_LABELS };
