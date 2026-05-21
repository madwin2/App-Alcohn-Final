import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Order, NewOrderFormData, OrderItem } from '@/lib/types/index';
import * as ordersService from '@/lib/supabase/services/orders.service';
import { supabase } from '@/lib/supabase/client';
import {
  clearEconomiaOrdersCache,
  readEconomiaOrdersCache,
  writeEconomiaOrdersCache,
} from '@/lib/economia/economiaOrdersCache';

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
    const patchById = new Map(updates.items.filter((i) => i.id).map((i) => [i.id, i]));
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

export interface UseOrdersOptions {
  /** @deprecated El provider gestiona realtime globalmente. */
  enableRealtime?: boolean;
  /** @deprecated El provider gestiona polling globalmente. */
  enablePolling?: boolean;
}

export interface OrdersContextValue {
  orders: Order[];
  loading: boolean;
  loadingFullCatalog: boolean;
  fullCatalogLoaded: boolean;
  error: Error | null;
  fetchOrders: (options?: { silent?: boolean; scope?: 'operational' | 'full' }) => Promise<void>;
  ensureFullCatalog: () => Promise<void>;
  createOrder: (formData: NewOrderFormData) => Promise<Order>;
  updateOrder: (orderId: string, updates: Partial<Order>) => Promise<Order>;
  deleteOrder: (orderId: string) => Promise<void>;
  addStampToOrder: (
    orderId: string,
    item: Partial<OrderItem>,
    files?: { base?: File; vector?: File; photo?: File },
  ) => Promise<OrderItem>;
  deleteStamp: (stampId: string) => Promise<void>;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

const REALTIME_DEBOUNCE_MS = 2500;
const POLLING_INTERVAL_MS = 60_000;

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFullCatalog, setLoadingFullCatalog] = useState(false);
  const [fullCatalogLoaded, setFullCatalogLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fullCatalogLoadedRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureFullInFlightRef = useRef<Promise<void> | null>(null);

  const bumpInvalidation = useCallback(() => {
    clearEconomiaOrdersCache();
  }, []);

  const fetchOrders = useCallback(
    async (options?: { silent?: boolean; scope?: 'operational' | 'full' }) => {
      const silent = options?.silent ?? false;
      const scope = options?.scope ?? (fullCatalogLoadedRef.current ? 'full' : 'operational');
      const gen = ++fetchGenerationRef.current;

      try {
        if (!silent) setLoading(true);
        setError(null);
        const data = await ordersService.getOrders({ scope });
        if (gen !== fetchGenerationRef.current) return;
        setOrders(data);
        if (scope === 'full') {
          fullCatalogLoadedRef.current = true;
          setFullCatalogLoaded(true);
          writeEconomiaOrdersCache(data);
        }
      } catch (err) {
        if (gen !== fetchGenerationRef.current) return;
        setError(err instanceof Error ? err : new Error('Error al cargar órdenes'));
        console.error('Error fetching orders:', err);
      } finally {
        if (gen === fetchGenerationRef.current && !silent) setLoading(false);
      }
    },
    [],
  );

  const ensureFullCatalog = useCallback(async () => {
    if (fullCatalogLoadedRef.current) return;
    if (ensureFullInFlightRef.current) return ensureFullInFlightRef.current;

    const run = async () => {
      const cached = readEconomiaOrdersCache();
      if (cached?.length) {
        setOrders(cached);
        fullCatalogLoadedRef.current = true;
        setFullCatalogLoaded(true);
        setLoading(false);
      }
      setLoadingFullCatalog(true);
      try {
        await fetchOrders({ scope: 'full', silent: !!cached?.length });
      } finally {
        setLoadingFullCatalog(false);
      }
    };

    ensureFullInFlightRef.current = run().finally(() => {
      ensureFullInFlightRef.current = null;
    });
    return ensureFullInFlightRef.current;
  }, [fetchOrders]);

  const scheduleSilentRefresh = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      bumpInvalidation();
      void fetchOrders({
        silent: true,
        scope: fullCatalogLoadedRef.current ? 'full' : 'operational',
      });
    }, REALTIME_DEBOUNCE_MS);
  }, [bumpInvalidation, fetchOrders]);

  useEffect(() => {
    void fetchOrders({ scope: 'operational' });
  }, [fetchOrders]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, scheduleSilentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sellos' }, scheduleSilentRefresh)
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleSilentRefresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOrders({
          silent: true,
          scope: fullCatalogLoadedRef.current ? 'full' : 'operational',
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchOrders({
        silent: true,
        scope: fullCatalogLoadedRef.current ? 'full' : 'operational',
      });
    }, POLLING_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchOrders]);

  const createOrder = useCallback(
    async (formData: NewOrderFormData): Promise<Order> => {
      const newOrder = await ordersService.createOrder(formData);
      bumpInvalidation();
      setOrders((prev) => [newOrder, ...prev]);
      return newOrder;
    },
    [bumpInvalidation],
  );

  const updateOrder = useCallback(
    async (orderId: string, updates: Partial<Order>): Promise<Order> => {
      let previousOrdersSnapshot: Order[] | null = null;
      try {
        setOrders((prevOrders) => {
          previousOrdersSnapshot = prevOrders;
          return prevOrders.map((order) =>
            order.id === orderId ? applyOptimisticPatch(order, updates) : order,
          );
        });

        const updatedOrder = await ordersService.updateOrder(orderId, updates);
        bumpInvalidation();
        setOrders((prevOrders) =>
          prevOrders.map((order) => (order.id === orderId ? updatedOrder : order)),
        );
        return updatedOrder;
      } catch (err) {
        if (previousOrdersSnapshot) setOrders(previousOrdersSnapshot);
        const e = err instanceof Error ? err : new Error('Error al actualizar orden');
        setError(e);
        throw e;
      }
    },
    [bumpInvalidation],
  );

  const deleteOrder = useCallback(async (orderId: string): Promise<void> => {
    await ordersService.deleteOrder(orderId);
    bumpInvalidation();
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  }, [bumpInvalidation]);

  const addStampToOrder = useCallback(
    async (
      orderId: string,
      item: Partial<OrderItem>,
      files?: { base?: File; vector?: File; photo?: File },
    ) => {
      const newStamp = await ordersService.addStampToOrder(orderId, item, files);
      bumpInvalidation();
      const updatedOrder = await ordersService.getOrderById(orderId);
      if (updatedOrder) {
        setOrders((prev) => prev.map((order) => (order.id === orderId ? updatedOrder : order)));
      }
      return newStamp;
    },
    [bumpInvalidation],
  );

  const deleteStamp = useCallback(
    async (stampId: string): Promise<void> => {
      const orderWithStamp = orders.find((o) => o.items.some((i) => i.id === stampId));
      await ordersService.deleteStamp(stampId);
      bumpInvalidation();
      if (orderWithStamp) {
        const updatedOrder = await ordersService.getOrderById(orderWithStamp.id);
        if (updatedOrder) {
          setOrders((prev) =>
            prev.map((order) => (order.id === orderWithStamp.id ? updatedOrder : order)),
          );
        }
      }
    },
    [bumpInvalidation, orders],
  );

  const value = useMemo(
    (): OrdersContextValue => ({
      orders,
      loading,
      loadingFullCatalog,
      fullCatalogLoaded,
      error,
      fetchOrders,
      ensureFullCatalog,
      createOrder,
      updateOrder,
      deleteOrder,
      addStampToOrder,
      deleteStamp,
    }),
    [
      orders,
      loading,
      loadingFullCatalog,
      fullCatalogLoaded,
      error,
      fetchOrders,
      ensureFullCatalog,
      createOrder,
      updateOrder,
      deleteOrder,
      addStampToOrder,
      deleteStamp,
    ],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(_options?: UseOrdersOptions): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) {
    throw new Error('useOrders debe usarse dentro de OrdersProvider');
  }
  return ctx;
}
