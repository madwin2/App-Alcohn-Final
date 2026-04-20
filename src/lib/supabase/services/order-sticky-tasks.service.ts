import { supabase } from '../client';

export interface OrderStickyTask {
  id: string;
  orderId: string;
  taskId: string;
  assignedToUserId: string;
  createdByUserId: string;
  text: string;
  posX: number;
  posY: number;
  createdAt: string;
}

const DEFAULT_POS_X = 60;
const DEFAULT_POS_Y = 120;

export const getOrderStickyTasksForUser = async (userId: string): Promise<OrderStickyTask[]> => {
  const { data, error } = await supabase
    .from('tareas_pedidos_globales')
    .select('id, orden_id, tarea_id, asignado_a_user_id, creado_por_user_id, texto, pos_x, pos_y, created_at')
    .eq('asignado_a_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching order sticky tasks:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    orderId: row.orden_id,
    taskId: row.tarea_id,
    assignedToUserId: row.asignado_a_user_id,
    createdByUserId: row.creado_por_user_id,
    text: row.texto,
    posX: row.pos_x ?? DEFAULT_POS_X,
    posY: row.pos_y ?? DEFAULT_POS_Y,
    createdAt: row.created_at,
  }));
};

export const createOrderStickyTask = async (params: {
  orderId: string;
  taskId: string;
  assignedToUserId: string;
  text: string;
  createdByUserId: string;
}): Promise<void> => {
  const { error } = await supabase.from('tareas_pedidos_globales').insert({
    orden_id: params.orderId,
    tarea_id: params.taskId,
    asignado_a_user_id: params.assignedToUserId,
    creado_por_user_id: params.createdByUserId,
    texto: params.text.trim(),
  });

  if (error) {
    console.error('Error creating order sticky task:', error);
    throw error;
  }
};

export const updateOrderStickyTaskPosition = async (
  stickyTaskId: string,
  posX: number,
  posY: number
): Promise<void> => {
  const { error } = await supabase
    .from('tareas_pedidos_globales')
    .update({ pos_x: posX, pos_y: posY })
    .eq('id', stickyTaskId);

  if (error) {
    console.error('Error updating order sticky task position:', error);
    throw error;
  }
};

export const deleteOrderStickyTask = async (stickyTaskId: string): Promise<void> => {
  const { error } = await supabase.from('tareas_pedidos_globales').delete().eq('id', stickyTaskId);

  if (error) {
    console.error('Error deleting order sticky task:', error);
    throw error;
  }
};

export const deleteOrderStickyTaskByTaskId = async (taskId: string): Promise<void> => {
  const { error } = await supabase.from('tareas_pedidos_globales').delete().eq('tarea_id', taskId);

  if (error) {
    console.error('Error deleting order sticky task by task id:', error);
    throw error;
  }
};
