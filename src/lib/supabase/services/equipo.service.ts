import { FB_TEST_EMAIL } from '@/lib/auth/access';
import { supabase } from '../client';

export type AreaPrincipalEquipo = 'ventas' | 'logistica' | 'produccion' | 'administracion';

export interface PerfilEquipo {
  userId: string;
  nombre: string;
  email: string | null;
  puesto: string | null;
  areaPrincipal: AreaPrincipalEquipo | null;
  fechaIngreso: string | null;
  fechaNacimiento: string | null;
  color: string;
  diasVacacionesAnuales: number;
  vacacionesSaldoBase: number;
  vacacionesSaldoBaseFecha: string;
  vacacionesSinLimite: boolean;
  esAdmin: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsuarioSinPerfil {
  userId: string;
  nombre: string;
  email: string | null;
}

export interface UpsertPerfilInput {
  userId: string;
  puesto?: string | null;
  areaPrincipal?: AreaPrincipalEquipo | null;
  fechaIngreso?: string | null;
  fechaNacimiento?: string | null;
  color?: string;
  diasVacacionesAnuales?: number;
  vacacionesSaldoBase?: number;
  /** Si se edita el saldo base, pasar la fecha de hoy (YYYY-MM-DD). */
  vacacionesSaldoBaseFecha?: string;
  vacacionesSinLimite?: boolean;
  esAdmin?: boolean;
  activo?: boolean;
}

type PerfilRow = {
  user_id: string;
  puesto: string | null;
  area_principal: string | null;
  fecha_ingreso: string | null;
  fecha_nacimiento: string | null;
  color: string;
  dias_vacaciones_anuales: number;
  vacaciones_saldo_base: number | string;
  vacaciones_saldo_base_fecha: string;
  vacaciones_sin_limite: boolean;
  es_admin: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

type SolicitudRow = {
  user_id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
};

function displayName(u: Pick<SolicitudRow, 'nombre' | 'apellido' | 'email'>): string {
  if (u.nombre && u.apellido) return `${u.nombre} ${u.apellido}`;
  return u.nombre || u.apellido || u.email || 'Usuario';
}

function mapPerfil(row: PerfilRow, nombre: string, email: string | null): PerfilEquipo {
  return {
    userId: row.user_id,
    nombre,
    email,
    puesto: row.puesto,
    areaPrincipal: (row.area_principal as AreaPrincipalEquipo | null) ?? null,
    fechaIngreso: row.fecha_ingreso,
    fechaNacimiento: row.fecha_nacimiento,
    color: row.color,
    diasVacacionesAnuales: row.dias_vacaciones_anuales,
    vacacionesSaldoBase: Number(row.vacaciones_saldo_base),
    vacacionesSaldoBaseFecha: row.vacaciones_saldo_base_fecha,
    vacacionesSinLimite: row.vacaciones_sin_limite,
    esAdmin: row.es_admin,
    activo: row.activo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchNombresMap(userIds: string[]): Promise<Map<string, { nombre: string; email: string | null }>> {
  const map = new Map<string, { nombre: string; email: string | null }>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('solicitudes_registro')
    .select('user_id, nombre, apellido, email')
    .in('user_id', userIds)
    .eq('estado', 'APROBADO');
  if (error) throw error;
  (data as SolicitudRow[] | null)?.forEach((u) => {
    map.set(u.user_id, { nombre: displayName(u), email: u.email });
  });
  return map;
}

/** Perfiles unidos con nombre de solicitudes_registro. Por defecto solo activos. */
export async function getMiembrosEquipo(opts?: {
  incluirInactivos?: boolean;
}): Promise<PerfilEquipo[]> {
  let query = supabase
    .from('perfiles_equipo')
    .select(
      'user_id, puesto, area_principal, fecha_ingreso, fecha_nacimiento, color, dias_vacaciones_anuales, vacaciones_saldo_base, vacaciones_saldo_base_fecha, vacaciones_sin_limite, es_admin, activo, created_at, updated_at',
    )
    .order('created_at', { ascending: true });

  if (!opts?.incluirInactivos) {
    query = query.eq('activo', true);
  }

  const { data, error } = await query;

  if (error) throw error;
  const rows = (data as PerfilRow[] | null) ?? [];
  const names = await fetchNombresMap(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const info = names.get(r.user_id);
    return mapPerfil(r, info?.nombre ?? 'Usuario', info?.email ?? null);
  });
}

/** Un perfil (activo o no). Incluye nombre si hay solicitud aprobada. */
export async function getMiPerfil(userId: string): Promise<PerfilEquipo | null> {
  const { data, error } = await supabase
    .from('perfiles_equipo')
    .select(
      'user_id, puesto, area_principal, fecha_ingreso, fecha_nacimiento, color, dias_vacaciones_anuales, vacaciones_saldo_base, vacaciones_saldo_base_fecha, vacaciones_sin_limite, es_admin, activo, created_at, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const names = await fetchNombresMap([userId]);
  const info = names.get(userId);
  return mapPerfil(data as PerfilRow, info?.nombre ?? 'Usuario', info?.email ?? null);
}

/**
 * Usuarios aprobados sin fila en perfiles_equipo.
 * Excluye la cuenta FBTEST. Solo el admin debería llamarlo (RLS no aplica a solicitudes).
 */
export async function getUsuariosSinPerfil(): Promise<UsuarioSinPerfil[]> {
  const [{ data: solicitudes, error: solError }, { data: perfiles, error: perError }] =
    await Promise.all([
      supabase
        .from('solicitudes_registro')
        .select('user_id, nombre, apellido, email')
        .eq('estado', 'APROBADO'),
      supabase.from('perfiles_equipo').select('user_id'),
    ]);

  if (solError) throw solError;
  if (perError) throw perError;

  const conPerfil = new Set(((perfiles as { user_id: string }[] | null) ?? []).map((p) => p.user_id));
  return ((solicitudes as SolicitudRow[] | null) ?? [])
    .filter((u) => (u.email ?? '').toLowerCase() !== FB_TEST_EMAIL.toLowerCase())
    .filter((u) => !conPerfil.has(u.user_id))
    .map((u) => ({
      userId: u.user_id,
      nombre: displayName(u),
      email: u.email,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Crear o actualizar un perfil (solo admin; lo impone la RLS). */
export async function upsertPerfil(input: UpsertPerfilInput): Promise<PerfilEquipo> {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
  };
  if (input.puesto !== undefined) payload.puesto = input.puesto;
  if (input.areaPrincipal !== undefined) payload.area_principal = input.areaPrincipal;
  if (input.fechaIngreso !== undefined) payload.fecha_ingreso = input.fechaIngreso;
  if (input.fechaNacimiento !== undefined) payload.fecha_nacimiento = input.fechaNacimiento;
  if (input.color !== undefined) payload.color = input.color;
  if (input.diasVacacionesAnuales !== undefined) {
    payload.dias_vacaciones_anuales = input.diasVacacionesAnuales;
  }
  if (input.vacacionesSaldoBase !== undefined) {
    payload.vacaciones_saldo_base = input.vacacionesSaldoBase;
  }
  if (input.vacacionesSaldoBaseFecha !== undefined) {
    payload.vacaciones_saldo_base_fecha = input.vacacionesSaldoBaseFecha;
  }
  if (input.vacacionesSinLimite !== undefined) {
    payload.vacaciones_sin_limite = input.vacacionesSinLimite;
  }
  if (input.esAdmin !== undefined) payload.es_admin = input.esAdmin;
  if (input.activo !== undefined) payload.activo = input.activo;

  const { data, error } = await supabase
    .from('perfiles_equipo')
    .upsert(payload, { onConflict: 'user_id' })
    .select(
      'user_id, puesto, area_principal, fecha_ingreso, fecha_nacimiento, color, dias_vacaciones_anuales, vacaciones_saldo_base, vacaciones_saldo_base_fecha, vacaciones_sin_limite, es_admin, activo, created_at, updated_at',
    )
    .single();

  if (error) throw error;
  const names = await fetchNombresMap([input.userId]);
  const info = names.get(input.userId);
  return mapPerfil(data as PerfilRow, info?.nombre ?? 'Usuario', info?.email ?? null);
}

/** Desactivar (no borrar) un perfil. Solo admin. */
export async function desactivarPerfil(userId: string): Promise<void> {
  const { error } = await supabase
    .from('perfiles_equipo')
    .update({ activo: false })
    .eq('user_id', userId);
  if (error) throw error;
}
