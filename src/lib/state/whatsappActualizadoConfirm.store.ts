import { create } from 'zustand';
import type { Order } from '@/lib/types/index';

/**
 * Cola de WhatsApp «pedido actualizado» esperando confirmación (pedido del dueño, 2026-11-25).
 * Al editar un pedido no se le escribe al cliente hasta que alguien aprieta «Sí»
 * en el cartel (ConfirmarWhatsappActualizadoHost). Si se editan varias cosas del
 * mismo pedido seguidas, queda un solo cartel con la versión más nueva.
 */
type WhatsappActualizadoConfirmState = {
  pendientes: Order[];
  pedir: (order: Order) => void;
  sacar: (orderId: string) => void;
};

export const useWhatsappActualizadoConfirmStore = create<WhatsappActualizadoConfirmState>((set) => ({
  pendientes: [],
  pedir: (order) =>
    set((s) => {
      const idx = s.pendientes.findIndex((o) => o.id === order.id);
      if (idx === -1) return { pendientes: [...s.pendientes, order] };
      const next = s.pendientes.slice();
      next[idx] = order;
      return { pendientes: next };
    }),
  sacar: (orderId) => set((s) => ({ pendientes: s.pendientes.filter((o) => o.id !== orderId) })),
}));

/** Pide confirmación antes de mandar el WhatsApp de pedido actualizado. */
export const pedirConfirmacionWhatsappActualizado = (order: Order): void => {
  useWhatsappActualizadoConfirmStore.getState().pedir(order);
};
