import { supabase } from '../client';

export type FrecuenciaTarea = 'diaria' | 'semanal' | 'quincenal' | 'mensual';

export interface TareaRecurrente {
  id: string;
  userId: string;
  creadoPor: string;
  titulo: string;
  descripcion: string | null;
  frecuencia: FrecuenciaTarea;
  diasSemana: number[] | null;
  diaMes: number | null;
  semanaInicio: string | null;
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
  orden?: number;
}

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
  activa: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
};

const SELECT =
  'id, user_id, creado_por, titulo, descripcion, frecuencia, dias_semana, dia_mes, semana_inicio, activa, orden, created_at, updated_at';

function mapTarea(row: TareaRow): TareaRecurrente {
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
    activa: row.activa,
    orden: row.orden,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tareas de un integrante (propias o admin viendo a alguien). Orden: orden ASC. */
export async function getTareasRecurrentes(userId: string): Promise<TareaRecurrente[]> {
  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .select(SELECT)
    .eq('user_id', userId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data as TareaRow[] | null) ?? []).map(mapTarea);
}

export async function crearTareaRecurrente(
  input: CrearTareaRecurrenteInput,
): Promise<TareaRecurrente> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('No autenticado');

  const payload = {
    user_id: input.userId,
    creado_por: uid,
    titulo: input.titulo.trim(),
    descripcion: input.descripcion?.trim() || null,
    frecuencia: input.frecuencia,
    dias_semana:
      input.frecuencia === 'semanal' || input.frecuencia === 'quincenal'
        ? input.diasSemana ?? []
        : null,
    dia_mes: input.frecuencia === 'mensual' ? input.diaMes ?? null : null,
    semana_inicio: input.frecuencia === 'quincenal' ? input.semanaInicio ?? null : null,
    orden: input.orden ?? 0,
    activa: true,
  };

  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .insert(payload)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapTarea(data as TareaRow);
}

export async function actualizarTareaRecurrente(
  input: ActualizarTareaRecurrenteInput,
): Promise<TareaRecurrente> {
  const patch: Record<string, unknown> = {};
  if (input.titulo !== undefined) patch.titulo = input.titulo.trim();
  if (input.descripcion !== undefined) patch.descripcion = input.descripcion?.trim() || null;
  if (input.frecuencia !== undefined) patch.frecuencia = input.frecuencia;
  if (input.diasSemana !== undefined) patch.dias_semana = input.diasSemana;
  if (input.diaMes !== undefined) patch.dia_mes = input.diaMes;
  if (input.semanaInicio !== undefined) patch.semana_inicio = input.semanaInicio;
  if (input.orden !== undefined) patch.orden = input.orden;

  // Limpiar campos que no aplican a la frecuencia resultante
  if (input.frecuencia === 'diaria') {
    patch.dias_semana = null;
    patch.dia_mes = null;
    patch.semana_inicio = null;
  } else if (input.frecuencia === 'semanal') {
    patch.dia_mes = null;
    patch.semana_inicio = null;
  } else if (input.frecuencia === 'quincenal') {
    patch.dia_mes = null;
  } else if (input.frecuencia === 'mensual') {
    patch.dias_semana = null;
    patch.semana_inicio = null;
  }

  const { data, error } = await supabase
    .from('tareas_recurrentes')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapTarea(data as TareaRow);
}

export async function borrarTareaRecurrente(id: string): Promise<void> {
  const { error } = await supabase.from('tareas_recurrentes').delete().eq('id', id);
  if (error) throw error;
}

/** Pausar/reactivar (dueño de la tarea o admin, vía RLS). */
export async function pausarTareaRecurrente(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from('tareas_recurrentes').update({ activa }).eq('id', id);
  if (error) throw error;
}

/** Reordena: lista de `{ id, orden }`. Solo filas que la RLS deja editar. */
export async function reordenarTareasRecurrentes(
  items: Array<{ id: string; orden: number }>,
): Promise<void> {
  if (items.length === 0) return;
  const results = await Promise.all(
    items.map(({ id, orden }) =>
      supabase.from('tareas_recurrentes').update({ orden }).eq('id', id),
    ),
  );
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) throw firstErr;
}
