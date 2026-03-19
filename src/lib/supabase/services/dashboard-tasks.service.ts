import { supabase } from '../client';

export interface DashboardTask {
  id: string;
  asignadoAUserId: string;
  creadoPorUserId: string;
  texto: string;
  createdAt: string;
  creadoPorNombre?: string;
  posX?: number;
  posY?: number;
}

/**
 * Obtener tareas del dashboard asignadas al usuario actual
 */
export const getDashboardTasksForUser = async (userId: string): Promise<DashboardTask[]> => {
  const { data, error } = await supabase
    .from('tareas_dashboard')
    .select('id, asignado_a_user_id, creado_por_user_id, texto, created_at, pos_x, pos_y')
    .eq('asignado_a_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching dashboard tasks:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const creadoPorIds = [...new Set(data.map((t) => t.creado_por_user_id))];
  const usersMap = new Map<string, string>();

  if (creadoPorIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('solicitudes_registro')
      .select('user_id, nombre, apellido, email')
      .in('user_id', creadoPorIds)
      .eq('estado', 'APROBADO');

    usuarios?.forEach((u) => {
      const name =
        u.nombre && u.apellido
          ? `${u.nombre} ${u.apellido}`
          : u.nombre || u.apellido || u.email || 'Compañero';
      usersMap.set(u.user_id, name);
    });
  }

  return data.map((t) => ({
    id: t.id,
    asignadoAUserId: t.asignado_a_user_id,
    creadoPorUserId: t.creado_por_user_id,
    texto: t.texto,
    createdAt: t.created_at,
    creadoPorNombre: usersMap.get(t.creado_por_user_id),
    posX: (t as { pos_x?: number }).pos_x ?? 0,
    posY: (t as { pos_y?: number }).pos_y ?? 0,
  }));
};

/**
 * Crear una tarea asignada a un compañero
 */
export const createDashboardTask = async (
  asignadoAUserId: string,
  creadoPorUserId: string,
  texto: string
): Promise<void> => {
  const { error } = await supabase
    .from('tareas_dashboard')
    .insert({
      asignado_a_user_id: asignadoAUserId,
      creado_por_user_id: creadoPorUserId,
      texto: texto.trim(),
    })
    ;

  if (error) {
    console.error('Error creating dashboard task:', error);
    throw error;
  }

  return;
};

/**
 * Actualizar posición de una tarea
 */
export const updateDashboardTaskPosition = async (
  taskId: string,
  posX: number,
  posY: number
): Promise<void> => {
  const { error } = await supabase
    .from('tareas_dashboard')
    .update({ pos_x: posX, pos_y: posY })
    .eq('id', taskId);

  if (error) {
    console.error('Error updating dashboard task position:', error);
    throw error;
  }
};

/**
 * Eliminar una tarea (marcar como hecha)
 */
export const deleteDashboardTask = async (taskId: string): Promise<void> => {
  const { error } = await supabase.from('tareas_dashboard').delete().eq('id', taskId);

  if (error) {
    console.error('Error deleting dashboard task:', error);
    throw error;
  }
};
