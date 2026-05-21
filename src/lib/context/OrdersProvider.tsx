import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from 'react';
import { Order, NewOrderFormData, OrderItem } from '@/lib/types/index';
import * as ordersService from '@/lib/supabase/services/orders.service';
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

const patchOrderList = (
  list: Order[],
  orderId: string,
  patch: Partial<Order> | ((order: Order) => Order),
): Order[] =>
  list.map((order) => {
    if (order.id !== orderId) return order;
    return typeof patch === 'function' ? patch(order) : applyOptimisticPatch(order, patch);
  });

export interface UseOrdersOptions {
  useFullCatalog?: boolean;
}

interface OrdersStateContextValue {
  operationalOrders: Order[];
  fullOrders: Order[] | null;
  orders: Order[];
  loading: boolean;
  loadingFullCatalog: boolean;
  fullCatalogLoaded: boolean;
  error: Error | null;
}

interface OrdersActionsContextValue {
  fetchOrders: (options?: {
    silent?: boolean;
    scope?: 'operational' | 'full';
    /** Incluye pedidos viejos abiertos (más lento). Por defecto false. */
    includeOlderOpen?: boolean;
  }) => Promise<void>;
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

export type OrdersContextValue = OrdersStateContextValue & OrdersActionsContextValue;

const OrdersStateContext = createContext<OrdersStateContextValue | null>(null);
const OrdersActionsContext = createContext<OrdersActionsContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [operationalOrders, setOperationalOrders] = useState<Order[]>([]);
  const [fullOrders, setFullOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFullCatalog, setLoadingFullCatalog] = useState(false);
  const [fullCatalogLoaded, setFullCatalogLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fullCatalogLoadedRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const ensureFullInFlightRef = useRef<Promise<void> | null>(null);
  const operationalOrdersRef = useRef<Order[]>([]);

  useEffect(() => {
    operationalOrdersRef.current = operationalOrders;
  }, [operationalOrders]);

  const bumpEconomiaCache = useCallback(() => {
    clearEconomiaOrdersCache();
  }, []);

  const applyOrdersState = useCallback((scope: 'operational' | 'full', data: Order[]) => {
    startTransition(() => {
      if (scope === 'full') {
        setFullOrders(data);
        fullCatalogLoadedRef.current = true;
        setFullCatalogLoaded(true);
        writeEconomiaOrdersCache(data);
      } else {
        setOperationalOrders(data);
      }
    });
  }, []);

  const fetchOrders = useCallback(
    async (options?: {
      silent?: boolean;
      scope?: 'operational' | 'full';
      includeOlderOpen?: boolean;
    }) => {
      const silent = options?.silent ?? false;
      const scope = options?.scope ?? 'operational';
      const gen = ++fetchGenerationRef.current;

      try {
        if (!silent && scope === 'operational') setLoading(true);
        if (!silent && scope === 'full') setLoadingFullCatalog(true);
        setError(null);

        const data = await ordersService.getOrders({
          scope,
          recentOnly: scope === 'operational' && !options?.includeOlderOpen,
        });
        if (gen !== fetchGenerationRef.current) return;
        applyOrdersState(scope, data);
      } catch (err) {
        if (gen !== fetchGenerationRef.current) return;
        setError(err instanceof Error ? err : new Error('Error al cargar órdenes'));
        console.error('Error fetching orders:', err);
      } finally {
        if (gen === fetchGenerationRef.current) {
          if (!silent && scope === 'operational') setLoading(false);
          if (!silent && scope === 'full') setLoadingFullCatalog(false);
        }
      }
    },
    [applyOrdersState],
  );

  const ensureFullCatalog = useCallback(async () => {
    if (fullCatalogLoadedRef.current) return;
    if (ensureFullInFlightRef.current) return ensureFullInFlightRef.current;

    const run = async () => {
      const cached = readEconomiaOrdersCache();
      if (cached?.length) {
        startTransition(() => {
          setFullOrders(cached);
          fullCatalogLoadedRef.current = true;
          setFullCatalogLoaded(true);
        });
      }
      await fetchOrders({ scope: 'full', silent: !!cached?.length });
    };

    ensureFullInFlightRef.current = run().finally(() => {
      ensureFullInFlightRef.current = null;
    });
    return ensureFullInFlightRef.current;
  }, [fetchOrders]);

  useEffect(() => {
    void fetchOrders({ scope: 'operational' });
  }, [fetchOrders]);

  const syncBothLists = useCallback(
    (orderId: string, patch: Partial<Order> | ((order: Order) => Order)) => {
      startTransition(() => {
        setOperationalOrders((prev) => patchOrderList(prev, orderId, patch));
        setFullOrders((prev) => (prev ? patchOrderList(prev, orderId, patch) : prev));
      });
    },
    [],
  );

  const createOrder = useCallback(
    async (formData: NewOrderFormData): Promise<Order> => {
      const newOrder = await ordersService.createOrder(formData);
      bumpEconomiaCache();
      startTransition(() => {
        setOperationalOrders((prev) => [newOrder, ...prev]);
      });
      return newOrder;
    },
    [bumpEconomiaCache],
  );

  const updateOrder = useCallback(
    async (orderId: string, updates: Partial<Order>): Promise<Order> => {
      let previousOperational: Order[] | null = null;
      let previousFull: Order[] | null = null;
      try {
        startTransition(() => {
          setOperationalOrders((prev) => {
            previousOperational = prev;
            return patchOrderList(prev, orderId, updates);
          });
          setFullOrders((prev) => {
            if (!prev) return prev;
            previousFull = prev;
            return patchOrderList(prev, orderId, updates);
          });
        });

        const updatedOrder = await ordersService.updateOrder(orderId, updates);
        bumpEconomiaCache();
        syncBothLists(orderId, updatedOrder);
        return updatedOrder;
      } catch (err) {
        if (previousOperational) setOperationalOrders(previousOperational);
        if (previousFull) setFullOrders(previousFull);
        const e = err instanceof Error ? err : new Error('Error al actualizar orden');
        setError(e);
        throw e;
      }
    },
    [bumpEconomiaCache, syncBothLists],
  );

  const deleteOrder = useCallback(
    async (orderId: string): Promise<void> => {
      await ordersService.deleteOrder(orderId);
      bumpEconomiaCache();
      startTransition(() => {
        setOperationalOrders((prev) => prev.filter((order) => order.id !== orderId));
        setFullOrders((prev) => (prev ? prev.filter((order) => order.id !== orderId) : prev));
      });
    },
    [bumpEconomiaCache],
  );

  const addStampToOrder = useCallback(
    async (
      orderId: string,
      item: Partial<OrderItem>,
      files?: { base?: File; vector?: File; photo?: File },
    ) => {
      const newStamp = await ordersService.addStampToOrder(orderId, item, files);
      bumpEconomiaCache();
      const updatedOrder = await ordersService.getOrderById(orderId);
      if (updatedOrder) {
        syncBothLists(orderId, updatedOrder);
      }
      return newStamp;
    },
    [bumpEconomiaCache, syncBothLists],
  );

  const deleteStamp = useCallback(
    async (stampId: string): Promise<void> => {
      const orderWithStamp = operationalOrdersRef.current.find((o) =>
        o.items.some((i) => i.id === stampId),
      );
      await ordersService.deleteStamp(stampId);
      bumpEconomiaCache();
      if (orderWithStamp) {
        const updatedOrder = await ordersService.getOrderById(orderWithStamp.id);
        if (updatedOrder) {
          syncBothLists(orderWithStamp.id, updatedOrder);
        }
      }
    },
    [bumpEconomiaCache, syncBothLists],
  );

  const stateValue = useMemo(
    (): OrdersStateContextValue => ({
      operationalOrders,
      fullOrders,
      orders: operationalOrders,
      loading,
      loadingFullCatalog,
      fullCatalogLoaded,
      error,
    }),
    [operationalOrders, fullOrders, loading, loadingFullCatalog, fullCatalogLoaded, error],
  );

  const actionsValue = useMemo(
    (): OrdersActionsContextValue => ({
      fetchOrders,
      ensureFullCatalog,
      createOrder,
      updateOrder,
      deleteOrder,
      addStampToOrder,
      deleteStamp,
    }),
    [
      fetchOrders,
      ensureFullCatalog,
      createOrder,
      updateOrder,
      deleteOrder,
      addStampToOrder,
      deleteStamp,
    ],
  );

  return (
    <OrdersActionsContext.Provider value={actionsValue}>
      <OrdersStateContext.Provider value={stateValue}>{children}</OrdersStateContext.Provider>
    </OrdersActionsContext.Provider>
  );
}

export function useOrdersState(): OrdersStateContextValue {
  const ctx = useContext(OrdersStateContext);
  if (!ctx) throw new Error('useOrdersState debe usarse dentro de OrdersProvider');
  return ctx;
}

export function useOrdersActions(): OrdersActionsContextValue {
  const ctx = useContext(OrdersActionsContext);
  if (!ctx) throw new Error('useOrdersActions debe usarse dentro de OrdersProvider');
  return ctx;
}

export function useOrders(options?: UseOrdersOptions): OrdersContextValue {
  const state = useOrdersState();
  const actions = useOrdersActions();
  const useFull = options?.useFullCatalog ?? false;
  const orders =
    useFull && state.fullCatalogLoaded && state.fullOrders
      ? state.fullOrders
      : state.operationalOrders;

  return { ...state, ...actions, orders };
}
