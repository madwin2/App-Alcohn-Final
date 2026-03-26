import { useState, useEffect, useCallback } from 'react';
import { Order, NewOrderFormData } from '../types/index';
import * as ordersService from '../supabase/services/orders.service';
import { supabase } from '../supabase/client';

const applyOptimisticPatch = (order: Order, updates: Partial<Order>): Order => {
  let nextOrder = { ...order };

  if (updates.orderDate !== undefined) {
    nextOrder.orderDate = updates.orderDate;
  }
  if (updates.deadlineAt !== undefined) {
    nextOrder.deadlineAt = updates.deadlineAt ?? null;
  }
  if (updates.saleStateOrder !== undefined) {
    nextOrder.saleStateOrder = updates.saleStateOrder ?? null;
  }
  if (updates.shipping !== undefined) {
    nextOrder.shipping = {
      ...nextOrder.shipping,
      ...updates.shipping,
    };
  }

  if (updates.items && updates.items.length > 0) {
    const patchById = new Map(updates.items.filter(i => i.id).map(i => [i.id, i]));
    nextOrder.items = nextOrder.items.map((item) => {
      const patch = patchById.get(item.id);
      if (!patch) return item;
      return {
        ...item,
        ...patch,
        files: patch.files ? { ...item.files, ...patch.files } : item.files,
      };
    });
  }

  return nextOrder;
};

export const useOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await ordersService.getOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error al cargar órdenes'));
      console.error('Error fetching orders:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime: actualizar lista cuando otra persona crea/edita/elimina órdenes o sellos
  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes' },
        () => fetchOrders({ silent: true })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sellos' },
        () => fetchOrders({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Fallback: polling para garantizar actualizaciones aunque realtime falle
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchOrders({ silent: true });
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchOrders]);

  const createOrder = async (formData: NewOrderFormData): Promise<Order> => {
    try {
      const newOrder = await ordersService.createOrder(formData);
      
      // Agregar la nueva orden al estado local inmediatamente
      setOrders(prevOrders => [newOrder, ...prevOrders]);
      
      return newOrder;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al crear orden');
      setError(error);
      throw error;
    }
  };

  const updateOrder = async (orderId: string, updates: Partial<Order>): Promise<Order> => {
    let previousOrdersSnapshot: Order[] | null = null;
    try {
      // Optimistic UI: mostrar el cambio inmediatamente en la tabla
      setOrders(prevOrders => {
        previousOrdersSnapshot = prevOrders;
        return prevOrders.map(order =>
          order.id === orderId ? applyOptimisticPatch(order, updates) : order
        );
      });

      const updatedOrder = await ordersService.updateOrder(orderId, updates);
      
      // Confirmar con versión canónica de DB
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId ? updatedOrder : order
        )
      );
      
      return updatedOrder;
    } catch (err) {
      // rollback optimistic update
      if (previousOrdersSnapshot) {
        setOrders(previousOrdersSnapshot);
      }
      const error = err instanceof Error ? err : new Error('Error al actualizar orden');
      setError(error);
      throw error;
    }
  };

  const deleteOrder = async (orderId: string): Promise<void> => {
    try {
      await ordersService.deleteOrder(orderId);
      
      // Actualizar el estado local inmediatamente sin recargar toda la lista
      setOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al eliminar orden');
      setError(error);
      throw error;
    }
  };

  const addStampToOrder = async (orderId: string, item: Partial<import('../types/index').OrderItem>, files?: { base?: File; vector?: File; photo?: File }) => {
    try {
      const newStamp = await ordersService.addStampToOrder(orderId, item, files);
      
      // Actualizar la orden en el estado local con el nuevo sello
      setOrders(prevOrders => 
        prevOrders.map(order => {
          if (order.id === orderId) {
            // Obtener la orden actualizada desde el servidor para tener todos los datos correctos
            // Por ahora, agregamos el sello manualmente
            return {
              ...order,
              items: [...order.items, newStamp]
            };
          }
          return order;
        })
      );
      
      // Refrescar la orden completa para tener los cálculos actualizados
      const updatedOrder = await ordersService.getOrderById(orderId);
      if (updatedOrder) {
        setOrders(prevOrders => 
          prevOrders.map(order => order.id === orderId ? updatedOrder : order)
        );
      }
      
      return newStamp;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al agregar sello');
      setError(error);
      throw error;
    }
  };

  const deleteStamp = async (stampId: string): Promise<void> => {
    try {
      // Encontrar la orden que contiene este sello
      const orderWithStamp = orders.find(order => 
        order.items.some(item => item.id === stampId)
      );
      
      await ordersService.deleteStamp(stampId);
      
      if (orderWithStamp) {
        // Actualizar la orden en el estado local removiendo el sello
        setOrders(prevOrders => 
          prevOrders.map(order => {
            if (order.id === orderWithStamp.id) {
              return {
                ...order,
                items: order.items.filter(item => item.id !== stampId)
              };
            }
            return order;
          })
        );
        
        // Refrescar la orden completa para tener los cálculos actualizados
        const updatedOrder = await ordersService.getOrderById(orderWithStamp.id);
        if (updatedOrder) {
          setOrders(prevOrders => 
            prevOrders.map(order => order.id === orderWithStamp.id ? updatedOrder : order)
          );
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al eliminar sello');
      setError(error);
      throw error;
    }
  };

  return {
    orders,
    loading,
    error,
    fetchOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    addStampToOrder,
    deleteStamp,
  };
};

