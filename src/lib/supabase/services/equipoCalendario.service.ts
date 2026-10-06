import { supabase } from '../client';
import { asegurarFilaAfectada, mapPostgrestError } from './rlsAffected';
import { fetchFeriadosNacionalesApi } from '@/lib/equipo/feriadosArgentina';

export type FeriadoOrigen = 'nacional' | 'empresa';

export interface Feriado {
  id: string;
  fecha: string;
  nombre: string;
  origen: FeriadoOrigen;
  tipo: string | null;
  createdAt: string;
}

export type AusenciaTipo = 'vacaciones' | 'cambio_dia';

export interface AusenciaEquipo {
  id: string;
  userId: string;
  tipo: AusenciaTipo;
  fechaDesde: string;
  fechaHasta: string;
  fechaRecupero: string | null;
  nota: string | null;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrearVacacionesInput {
  userId: string;
  fechaDesde: string;
  fechaHasta: string;
  nota?: string | null;
}

export interface CrearCambioDiaInput {
  userId: string;
  fecha: string;
  fechaRecupero?: string | null;
  nota?: string | null;
}

export interface ActualizarAusenciaInput {
  id: string;
  fechaDesde?: string;
  fechaHasta?: string;
  fechaRecupero?: string | null;
  nota?: string | null;
}

type FeriadoRow = {
  id: string;
  fecha: string;
  nombre: string;
  origen: string;
  tipo: string | null;
  created_at: string;
};

type AusenciaRow = {
  id: string;
  user_id: string;
  tipo: string;
  fecha_desde: string;
  fecha_hasta: string;
  fecha_recupero: string | null;
  nota: string | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
};

function mapFeriado(row: FeriadoRow): Feriado {
  return {
    id: row.id,
    fecha: row.fecha,
    nombre: row.nombre,
    origen: row.origen as FeriadoOrigen,
    tipo: row.tipo,
    createdAt: row.created_at,
  };
}

function mapAusencia(row: AusenciaRow): AusenciaEquipo {
  return {
    id: row.id,
    userId: row.user_id,
    tipo: row.tipo as AusenciaTipo,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    fechaRecupero: row.fecha_recupero,
    nota: row.nota,
    creadoPor: row.creado_por,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const AUSENCIA_SELECT =
  'id, user_id, tipo, fecha_desde, fecha_hasta, fecha_recupero, nota, creado_por, created_at, updated_at';

/** Feriados en un rango (inclusive). */
export async function getFeriados(opts?: {
  desde?: string;
  hasta?: string;
}): Promise<Feriado[]> {
  let query = supabase
    .from('feriados')
    .select('id, fecha, nombre, origen, tipo, created_at')
    .order('fecha', { ascending: true });

  if (opts?.desde) query = query.gte('fecha', opts.desde);
  if (opts?.hasta) query = query.lte('fecha', opts.hasta);

  const { data, error } = await query;
  if (error) throw error;
  return ((data as FeriadoRow[] | null) ?? []).map(mapFeriado);
}

/** ¿Hay al menos un feriado nacional en el año? */
export async function hayFeriadosNacionales(anio: number): Promise<boolean> {
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const { count, error } = await supabase
    .from('feriados')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'nacional')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Importa feriados nacionales del año desde ArgentinaDatos.
 * Inserta con ON CONFLICT DO NOTHING. Devuelve cuántos se agregaron.
 */
export async function importarFeriadosNacionales(anio: number): Promise<{
  agregados: number;
  totalApi: number;
}> {
  const items = await fetchFeriadosNacionalesApi(anio);
  if (items.length === 0) return { agregados: 0, totalApi: 0 };

  const existentes = await getFeriados({
    desde: `${anio}-01-01`,
    hasta: `${anio}-12-31`,
  });
  const keys = new Set(
    existentes
      .filter((f) => f.origen === 'nacional')
      .map((f) => `${f.fecha}|${f.nombre}`),
  );

  const nuevos = items.filter((i) => !keys.has(`${i.fecha}|${i.nombre}`));
  if (nuevos.length === 0) return { agregados: 0, totalApi: items.length };

  const { error } = await supabase.from('feriados').upsert(
    nuevos.map((i) => ({
      fecha: i.fecha,
      nombre: i.nombre,
      origen: 'nacional',
      tipo: i.tipo || null,
    })),
    { onConflict: 'fecha,origen,nombre', ignoreDuplicates: true },
  );
  if (error) throw error;
  return { agregados: nuevos.length, totalApi: items.length };
}

export async function crearFeriadoEmpresa(input: {
  fecha: string;
  nombre: string;
}): Promise<Feriado> {
  const { data, error } = await supabase
    .from('feriados')
    .insert({
      fecha: input.fecha,
      nombre: input.nombre.trim(),
      origen: 'empresa',
      tipo: null,
    })
    .select('id, fecha, nombre, origen, tipo, created_at')
    .single();
  if (error) throw error;
  return mapFeriado(data as FeriadoRow);
}

export async function borrarFeriado(id: string): Promise<void> {
  const { data, error } = await supabase.from('feriados').delete().eq('id', id).select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** Ausencias que solapan un rango (para el calendario del mes). */
export async function getAusencias(opts?: {
  desde?: string;
  hasta?: string;
  userId?: string;
}): Promise<AusenciaEquipo[]> {
  let query = supabase
    .from('ausencias_equipo')
    .select(AUSENCIA_SELECT)
    .order('fecha_desde', { ascending: true });

  if (opts?.userId) query = query.eq('user_id', opts.userId);
  // Solape con [desde, hasta]: fecha_desde <= hasta AND fecha_hasta >= desde
  // También incluir recuperos que caigan en el rango.
  if (opts?.desde && opts?.hasta) {
    const desde = opts.desde;
    const hasta = opts.hasta;
    query = query.or(
      `and(fecha_desde.lte.${hasta},fecha_hasta.gte.${desde}),and(fecha_recupero.gte.${desde},fecha_recupero.lte.${hasta})`,
    );
  } else if (opts?.desde) {
    query = query.gte('fecha_hasta', opts.desde);
  } else if (opts?.hasta) {
    query = query.lte('fecha_desde', opts.hasta);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data as AusenciaRow[] | null) ?? []).map(mapAusencia);
}

/** Todas las ausencias de un usuario (lista "Mis vacaciones y cambios"). */
export async function getAusenciasDeUsuario(userId: string): Promise<AusenciaEquipo[]> {
  const { data, error } = await supabase
    .from('ausencias_equipo')
    .select(AUSENCIA_SELECT)
    .eq('user_id', userId)
    .order('fecha_desde', { ascending: false });
  if (error) throw error;
  return ((data as AusenciaRow[] | null) ?? []).map(mapAusencia);
}

/**
 * EQ-R07: datos para calcular el saldo de vacaciones, sin ventanas de años fijas.
 * - `ausencias`: todas las vacaciones de esas personas con `fecha_hasta` posterior a su
 *   `vacaciones_saldo_base_fecha` (las anteriores ya están dentro del saldo base).
 * - `feriados`: desde la menor fecha base hasta la mayor `fecha_hasta` de esas ausencias.
 */
export async function getDatosSaldoVacaciones(
  userIds: string[],
): Promise<{ ausencias: AusenciaEquipo[]; feriados: Feriado[] }> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return { ausencias: [], feriados: [] };

  const [perfilesRes, ausenciasRes] = await Promise.all([
    supabase
      .from('perfiles_equipo')
      .select('user_id, vacaciones_saldo_base_fecha')
      .in('user_id', ids),
    supabase
      .from('ausencias_equipo')
      .select(AUSENCIA_SELECT)
      .eq('tipo', 'vacaciones')
      .in('user_id', ids)
      .order('fecha_desde', { ascending: true }),
  ]);
  if (perfilesRes.error) throw perfilesRes.error;
  if (ausenciasRes.error) throw ausenciasRes.error;

  const baseFechaPorUser = new Map<string, string>();
  for (const p of (perfilesRes.data as Array<{
    user_id: string;
    vacaciones_saldo_base_fecha: string | null;
  }> | null) ?? []) {
    if (p.vacaciones_saldo_base_fecha) {
      baseFechaPorUser.set(p.user_id, p.vacaciones_saldo_base_fecha);
    }
  }

  const ausencias = ((ausenciasRes.data as AusenciaRow[] | null) ?? [])
    .map(mapAusencia)
    .filter((a) => {
      const base = baseFechaPorUser.get(a.userId);
      // Sin perfil/fecha base conocida: se deja pasar (el cálculo filtra por su cuenta).
      return !base || a.fechaHasta > base;
    });

  if (ausencias.length === 0) return { ausencias, feriados: [] };

  let desde = ausencias[0].fechaDesde;
  let hasta = ausencias[0].fechaHasta;
  for (const a of ausencias) {
    if (a.fechaDesde < desde) desde = a.fechaDesde;
    if (a.fechaHasta > hasta) hasta = a.fechaHasta;
  }
  const bases = Array.from(baseFechaPorUser.values());
  if (bases.length > 0) {
    const menorBase = bases.reduce((min, b) => (b < min ? b : min));
    if (menorBase < desde) desde = menorBase;
  }

  const feriados = await getFeriados({ desde, hasta });
  return { ausencias, feriados };
}

export async function crearVacaciones(input: CrearVacacionesInput): Promise<AusenciaEquipo> {
  const { data, error } = await supabase
    .from('ausencias_equipo')
    .insert({
      user_id: input.userId,
      tipo: 'vacaciones',
      fecha_desde: input.fechaDesde,
      fecha_hasta: input.fechaHasta,
      fecha_recupero: null,
      nota: input.nota?.trim() || null,
    })
    .select(AUSENCIA_SELECT)
    .single();
  if (error) throw error;
  return mapAusencia(data as AusenciaRow);
}

export async function crearCambioDia(input: CrearCambioDiaInput): Promise<AusenciaEquipo> {
  const { data, error } = await supabase
    .from('ausencias_equipo')
    .insert({
      user_id: input.userId,
      tipo: 'cambio_dia',
      fecha_desde: input.fecha,
      fecha_hasta: input.fecha,
      fecha_recupero: input.fechaRecupero || null,
      nota: input.nota?.trim() || null,
    })
    .select(AUSENCIA_SELECT)
    .single();
  if (error) throw error;
  return mapAusencia(data as AusenciaRow);
}

export async function actualizarAusencia(
  input: ActualizarAusenciaInput,
): Promise<AusenciaEquipo> {
  const payload: Record<string, unknown> = {};
  if (input.fechaDesde !== undefined) payload.fecha_desde = input.fechaDesde;
  if (input.fechaHasta !== undefined) payload.fecha_hasta = input.fechaHasta;
  if (input.fechaRecupero !== undefined) payload.fecha_recupero = input.fechaRecupero;
  if (input.nota !== undefined) payload.nota = input.nota?.trim() || null;

  const { data, error } = await supabase
    .from('ausencias_equipo')
    .update(payload)
    .eq('id', input.id)
    .select(AUSENCIA_SELECT)
    .single();
  if (error) throw mapPostgrestError(error);
  return mapAusencia(asegurarFilaAfectada(data) as AusenciaRow);
}

export async function borrarAusencia(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('ausencias_equipo')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}
