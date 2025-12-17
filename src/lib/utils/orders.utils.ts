import { Order, FabricationState } from '../types/index';

// Función para obtener contadores por estado de fabricación
export const getFabricationCounts = (orders: Order[]) => {
  const counts: Record<FabricationState, number> = {
    SIN_HACER: 0,
    HACIENDO: 0,
    VERIFICAR: 0,
    HECHO: 0,
    REHACER: 0,
    RETOCAR: 0,
    PROGRAMADO: 0
  };

  orders.forEach(order => {
    order.items.forEach(item => {
      counts[item.fabricationState]++;
    });
  });

  return counts;
};








