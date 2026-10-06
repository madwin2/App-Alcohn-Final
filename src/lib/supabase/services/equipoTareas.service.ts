import { supabase } from '../client';
import { asegurarFilaAfectada, mapPostgrestError } from './rlsAffected';
import type { FrecuenciaTarea } from '@/lib/equipo/tareasRecurrentes';
import type { EstadoRegistroTarea } from '@/lib/equipo/tareasAgenda';

export type { FrecuenciaTarea };

export interface TareaRecurrente {
  id: string;
  userId: string;
  creadoPor: string;
  titulo: string;
  descripcion: string | null;
  frecuencia: FrecuenciaTarea;
  diasSemana: number[] | null;
  diaMes: number | null;
  /** Quincenal: lunes de referencia. (Única usa `fecha`.) */
  semanaInicio: string | null;
  /** Única: fecha concreta del día. */
  fecha: string | null;
  activa: boolean;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrearTareaRecurrenteInput {
  userId: string;
  titulo: string;
  descripcion?: string | null;
  frecuencia: FrecuenciaTarea;
  diasSemana?: number[] | null;
  diaMes?: number | null;
  semanaInicio?: string | null;
  fecha?: string | null;
  orden?: number;
}

export interface ActualizarTareaRecurrenteInput {
  id: string;
  titulo?: string;
  descripcion?: string | null;
  frecuencia?: FrecuenciaTarea;
  diasSemana?: number[] | null;
  diaMes?: number | null;
  semanaInicio?: string | null;
  fecha?: string | null;
  orden?: number;
}

export type TareaRegistro = {
  id: string;
  tareaId: string;
  fechaProgramada: string;
  estado: EstadoRegistroTarea;
  fechaDestino: string | null;
  marcadoPor: string;
  marcadoAt: string;
};

type TareaRow = {
  id: string;
  user_id: string;
  creado_por: string;
  titulo: string;
  descripcion: string | null;
  frecuencia: string;
  dias_semana: number[] | null;
  dia_mes: number | null;
  semana_inicio: string | null;
  fecha: string | null;
  activa: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
};

type RegistroRow = {
  id: string;
  tarea_id: string;
  fecha_programada: string;
  estado: string;
  fecha_destino: string | null;
  marcado_por: string;
  marcado_at: string;
};

const SELECT_LEGACY =
  'id, user_id, creado_por, titulo, descripcion, frecuencia, dias_semana, dia_mes, semana_inicio, activa, orden, created_at, updated_at';

const SELECT =
  'id, user_id, creado_por, titulo, descripcion, frecuencia, dias_semana, dia_mes, semana_inicio, fecha, activa, orden, created_at, updated_at';

const SELECT_REGISTRO =
  'id, tarea_id, fecha_programada, estado, fecha_destino, marcado_por, marcado_at';

/** true cuando migration_equipo_tareas_registro.sql está aplicada (columna `fecha` + tabla `tareas_registro`). */
let schemaTareasRegistroReady: boolean | null = null;

async function ensureSchemaTareasRegistro(): Promise<boolean> {
  if (schemaTareasRegistroReady != null) return schemaTareasRegistroReady;
  const { error } = await supabase.from('tareas_recurrentes').select('fecha').limit(1);
  schemaTareasRegistroReady = !error;
  return schemaTareasRegistroReady;
}

function mapTarea(row: TareaRow & { fecha?: string | null }): TareaRecurrente {
  const fecha =
    row.fecha ??
    (row.frecuencia === 'unica' ? row.semana_inicio : null);
  return {
    id: row.id,
    userId: row.user_id,
    creadoPor: row.creado_por,
    titulo: row.titulo,
    descripcion: row.descripcion,
    frecuencia: row.frecuencia as FrecuenciaTarea,
    diasSemana: row.dias_semana,
    diaMes: row.dia_mes,
    semanaInicio: row.semana_inicio,
    fecha,
    activa: row.activa,
    orden: row.orden,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegistro(row: RegistroRow): TareaRegistro {
  return {
    id: row.id,
    tareaId: row.tarea_id,
    fechaProgramada: row.fecha_programada,
    estado: row.estado as EstadoRegistroTarea,
    fechaDestino: row.fecha_destino,
    marcadoPor: row.marcado_por,
    marcadoAt: row.marcado_at,
  };
}

function camposPorFrecuencia(
  input: {
    frecuencia: FrecuenciaTarea;
    diasSemana?: number[] | null;
    diaMes?: number | null;
    semanaInicio?: string | null;
    fecha?: string | null;
  },
  opts?: { conColumnaFecha: boolean },
): {
  dias_semana: number[] | null;
  dia_mes: number | null;
  semana_inicio: string | null;
  fecha?: string | null;
} {
  const conFecha = opts?.conColumnaFecha ?? true;
  const fechaUnica = input.fecha ?? input.semanaInicio ?? null;
  switch (input.frecuencia) {
    case 'diaria':
      return conFecha
        ? { dias_semana: null, dia_mes: null, semana_inicio: null, fecha: null }
        : { dias_semana: null, dia_mes: null, semana_inicio: null };
    case 'semanal':
      return conFecha
        ? {
            dias_semana: input.diasSemana ?? [],
            dia_mes: null,
            semana_inicio: null,
            fecha: null,
          }
        : { dias_semana: input.diasSemana ?? [], dia_mes: null, semana_inicio: null };
    case 'quincenal':
      return conFecha
        ? {
            dias_semana: input.diasSemana ?? [],
            dia_mes: null,
            semana_inicio: input.semanaInicio ?? null,
            fecha: null,
          }
        : {
            dias_semana: input.diasSemana ?? [],
            dia_mes: null,
            semana_inicio: input.semanaInicio ?? null,
          };
    case 'mensual':
      return conFecha
        ? {
            dias_semana: null,
            dia_mes: input.diaMes ?? null,
            semana_inicio: null,
            fecha: null,
          }
        : { dias_semana: null, dia_mes: input.diaMes ?? null, semana_inicio: null };
    case 'unica':
      // Con columna `fecha`: guardar ahí. Legacy: en semana_inicio.
      return conFecha
        ? {
            dias_semana: null,
            dia_mes: null,
            semana_inicio: null,
            fecha: fechaUnica,
          }
        : {
            dias_semana: null,
            dia_mes: null,
            semana_inicio: fechaUnica,
          };
    default:
      return conFecha
        ? { dias_semana: null, dia_mes: null, semana_inicio: null, fecha: null }
        : { dias_semana: null, dia_mes: null, semana_inicio: null };
  }
}

/** Tareas de un integrante (propias o admin viendo a alguien). Orden: orden ASC. */
export async function getTareasRecurrentes(userId: string): Promise<TareaRecurrente[]> {
  const ready = await ensureSchemaTareasRegistro();
  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .select(ready ? SELECT : SELECT_LEGACY)
    .eq('user_id', userId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data as unknown as TareaRow[] | null) ?? []).map(mapTarea);
}

export async function crearTareaRecurrente(
  input: CrearTareaRecurrenteInput,
): Promise<TareaRecurrente> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('No autenticado');

  const ready = await ensureSchemaTareasRegistro();
  const campos = camposPorFrecuencia(input, { conColumnaFecha: ready });
  const payload = {
    user_id: input.userId,
    creado_por: uid,
    titulo: input.titulo.trim(),
    descripcion: input.descripcion?.trim() || null,
    frecuencia: input.frecuencia,
    ...campos,
    orden: input.orden ?? 0,
    activa: true,
  };

  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .insert(payload)
    .select(ready ? SELECT : SELECT_LEGACY)
    .single();

  if (error) throw error;
  return mapTarea(data as unknown as TareaRow);
}

export async function actualizarTareaRecurrente(
  input: ActualizarTareaRecurrenteInput,
): Promise<TareaRecurrente> {
  const ready = await ensureSchemaTareasRegistro();
  const patch: Record<string, unknown> = {};
  if (input.titulo !== undefined) patch.titulo = input.titulo.trim();
  if (input.descripcion !== undefined) patch.descripcion = input.descripcion?.trim() || null;
  if (input.orden !== undefined) patch.orden = input.orden;

  if (input.frecuencia !== undefined) {
    patch.frecuencia = input.frecuencia;
    const campos = camposPorFrecuencia(
      {
        frecuencia: input.frecuencia,
        diasSemana: input.diasSemana,
        diaMes: input.diaMes,
        semanaInicio: input.semanaInicio,
        fecha: input.fecha,
      },
      { conColumnaFecha: ready },
    );
    Object.assign(patch, campos);
  } else {
    if (input.diasSemana !== undefined) patch.dias_semana = input.diasSemana;
    if (input.diaMes !== undefined) patch.dia_mes = input.diaMes;
    if (input.semanaInicio !== undefined) patch.semana_inicio = input.semanaInicio;
    if (ready && input.fecha !== undefined) patch.fecha = input.fecha;
    if (!ready && input.fecha !== undefined && input.frecuencia === undefined) {
      // Legacy unica: la fecha iba en semana_inicio
      patch.semana_inicio = input.fecha;
    }
  }

  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .update(patch)
    .eq('id', input.id)
    .select(ready ? SELECT : SELECT_LEGACY)
    .single();

  if (error) throw mapPostgrestError(error);
  return mapTarea(asegurarFilaAfectada(data) as unknown as TareaRow);
}

export async function borrarTareaRecurrente(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** Pausar/reactivar (dueño de la tarea o admin, vía RLS). */
export async function pausarTareaRecurrente(id: string, activa: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .update({ activa })
    .eq('id', id)
    .select('id');
  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** Reordena: lista de `{ id, orden }`. Solo filas que la RLS deja editar. */
export async function reordenarTareasRecurrentes(
  items: Array<{ id: string; orden: number }>,
): Promise<void> {
  if (items.length === 0) return;
  const results = await Promise.all(
    items.map(({ id, orden }) =>
      supabase.from('tareas_recurrentes').update({ orden }).eq('id', id).select('id'),
    ),
  );
  for (const r of results) {
    if (r.error) throw mapPostgrestError(r.error);
    asegurarFilaAfectada(r.data);
  }
}

/** Registros de ocurrencias para un conjunto de tareas. */
export async function getRegistrosTareas(tareaIds: string[]): Promise<TareaRegistro[]> {
  if (tareaIds.length === 0) return [];
  const ready = await ensureSchemaTareasRegistro();
  if (!ready) return [];
  const { data, error } = await supabase
    .from('tareas_registro')
    .select(SELECT_REGISTRO)
    .in('tarea_id', tareaIds);

  if (error) throw error;
  return ((data as RegistroRow[] | null) ?? []).map(mapRegistro);
}

function assertRegistroSchema(ready: boolean): void {
  if (!ready) {
    throw new Error(
      'Falta aplicar migration_equipo_tareas_registro.sql para marcar tareas.',
    );
  }
}

/** Marca (upsert) una ocurrencia: hecha / no_hecha / movida. */
export async function marcarTareaOcurrencia(input: {
  tareaId: string;
  fechaProgramada: string;
  estado: EstadoRegistroTarea;
  fechaDestino?: string | null;
}): Promise<TareaRegistro> {
  assertRegistroSchema(await ensureSchemaTareasRegistro());
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('No autenticado');

  const payload = {
    tarea_id: input.tareaId,
    fecha_programada: input.fechaProgramada,
    estado: input.estado,
    fecha_destino: input.estado === 'movida' ? (input.fechaDestino ?? null) : null,
    marcado_por: uid,
    marcado_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('tareas_registro')
    .upsert(payload, { onConflict: 'tarea_id,fecha_programada' })
    .select(SELECT_REGISTRO)
    .single();

  if (error) throw mapPostgrestError(error);
  return mapRegistro(asegurarFilaAfectada(data) as RegistroRow);
}

/** Quita la marca de una ocurrencia (vuelve a pendiente). */
export async function desmarcarTareaOcurrencia(
  tareaId: string,
  fechaProgramada: string,
): Promise<void> {
  assertRegistroSchema(await ensureSchemaTareasRegistro());
  const { data, error } = await supabase
    .from('tareas_registro')
    .delete()
    .eq('tarea_id', tareaId)
    .eq('fecha_programada', fechaProgramada)
    .select('id');

  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}

/** S14: marca varias fechas programadas atrasadas como no_hecha. */
export async function marcarAtrasadasComoNoHechas(
  tareaId: string,
  fechasProgramadas: string[],
): Promise<void> {
  if (fechasProgramadas.length === 0) return;
  assertRegistroSchema(await ensureSchemaTareasRegistro());

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('No autenticado');

  const ahora = new Date().toISOString();
  const rows = fechasProgramadas.map((fecha) => ({
    tarea_id: tareaId,
    fecha_programada: fecha,
    estado: 'no_hecha' as const,
    fecha_destino: null,
    marcado_por: uid,
    marcado_at: ahora,
  }));

  const { data, error } = await supabase
    .from('tareas_registro')
    .upsert(rows, { onConflict: 'tarea_id,fecha_programada' })
    .select('id');

  if (error) throw mapPostgrestError(error);
  asegurarFilaAfectada(data);
}
