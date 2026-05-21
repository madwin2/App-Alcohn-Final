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
import { supabase } from '@/lib/supabase/client';
import {
  clearEconomiaOrdersCache,
  readEconomiaOrdersCache,
  writeEconomiaOrdersCache,
} from '@/lib/economia/economiaOrdersCache';
import {
  clearOperationalOrdersCache,
  readOperationalOrdersCache,
  scheduleOperationalOrdersCacheWrite,
} from '@/lib/orders/operationalOrdersCache';

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

const mergeOperationalOrders = (base: Order[], extra: Order[]): Order[] => {
  if (!extra.length) return base;
  const byId = new Map(base.map((o) => [o.id, o]));
  for (const o of extra) {
    if (!byId.has(o.id)) byId.set(o.id, o);
  }
  return [...byId.values()].sort((a, b) => {
    const da = a.orderDate || '';
    const db = b.orderDate || '';
    if (da !== db) return db.localeCompare(da);
    return b.id.localeCompare(a.id);
  });
};

const mergeRecentIntoOperationalList = (prev: Order[], recent: Order[]): Order[] => {
  const recentIds = new Set(recent.map((o) => o.id));
  const rest = prev.filter((o) => !recentIds.has(o.id));
  return mergeOperationalOrders(recent, rest);
};

const commitOperationalList = (_prev: Order[], next: Order[], cacheComplete = false): Order[] => {
  scheduleOperationalOrdersCacheWrite(next, { complete: cacheComplete });
  return next;
};

const OLDER_OPEN_DEFER_MS = 3_000;
const MIN_REFRESH_GAP_MS = 60_000;

export interface UseOrdersOptions {
  /** Usar histórico completo (Economía o búsqueda en toda la base). */
  useFullCatalog?: boolean;
  enableRealtime?: boolean;
  enablePolling?: boolean;
}

interface OrdersContextValue {
  /** Lista operativa (rápida): recientes + abiertos. */
  operationalOrders: Order[];
  /** Histórico completo; solo se llena bajo demanda. */
  fullOrders: Order[] | null;
  /** Alias de operationalOrders o fullOrders según `useFullCatalog`. */
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

const REALTIME_DEBOUNCE_MS = 8_000;
const POLLING_INTERVAL_MS = 120_000;

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [operationalOrders, setOperationalOrders] = useState<Order[]>([]);
  const [fullOrders, setFullOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFullCatalog, setLoadingFullCatalog] = useState(false);
  const [fullCatalogLoaded, setFullCatalogLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fullCatalogLoadedRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureFullInFlightRef = useRef<Promise<void> | null>(null);
  const olderOpenLoadedRef = useRef(false);
  const lastOperationalFetchAtRef = useRef(0);

  const bumpInvalidation = useCallback(() => {
    clearEconomiaOrdersCache();
    clearOperationalOrdersCache();
    olderOpenLoadedRef.current = false;
  }, []);

  const bumpEconomiaCacheOnly = useCallback(() => {
    clearEconomiaOrdersCache();
  }, []);

  const mergeOlderOpenInBackground = useCallback(
    (recent: Order[], gen: number, cancelled?: () => boolean) => {
      if (olderOpenLoadedRef.current) return;
      const run = async () => {
        try {
          const older = await ordersService.getOrdersOlderOpenOperational(recent);
          if (cancelled?.() || gen !== fetchGenerationRef.current || !older.length) return;
          olderOpenLoadedRef.current = true;
          startTransition(() => {
            setOperationalOrders((prev) =>
              commitOperationalList(prev, mergeOperationalOrders(prev, older), true),
            );
          });
        } catch (e) {
          console.warn('[orders] Pedidos viejos abiertos:', e);
        }
      };
      void run();
    },
    [],
  );

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
    async (options?: { silent?: boolean; scope?: 'operational' | 'full' }) => {
      const silent = options?.silent ?? false;
      const scope = options?.scope ?? 'operational';
      const gen = ++fetchGenerationRef.current;

      try {
        if (!silent && scope === 'operational') setLoading(true);
        if (!silent && scope === 'full') setLoadingFullCatalog(true);
        setError(null);
        if (scope === 'operational') {
          const recent = await ordersService.getOrdersRecentOperational();
          if (gen !== fetchGenerationRef.current) return;
          lastOperationalFetchAtRef.current = Date.now();
          startTransition(() => {
            setOperationalOrders((prev) =>
              commitOperationalList(prev, mergeRecentIntoOperationalList(prev, recent)),
            );
          });
          if (!olderOpenLoadedRef.current) {
            window.setTimeout(() => {
              if (gen === fetchGenerationRef.current) mergeOlderOpenInBackground(recent, gen);
            }, OLDER_OPEN_DEFER_MS);
          }
        } else {
          const data = await ordersService.getOrders({ scope });
          if (gen !== fetchGenerationRef.current) return;
          applyOrdersState(scope, data);
        }
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
    [applyOrdersState, mergeOlderOpenInBackground],
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

  const scheduleOperationalRefresh = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      bumpEconomiaCacheOnly();
      void fetchOrders({ silent: true, scope: 'operational' });
    }, REALTIME_DEBOUNCE_MS);
  }, [bumpEconomiaCacheOnly, fetchOrders]);

  useEffect(() => {
    let cancelled = false;

    const loadOperational = async () => {
      const cached = readOperationalOrdersCache();
      if (cached?.orders.length && !cancelled) {
        setOperationalOrders(cached.orders);
        if (cached.complete) olderOpenLoadedRef.current = true;
        setLoading(false);
      }

      try {
        const recent = await ordersService.getOrdersRecentOperational();
        if (cancelled) return;
        lastOperationalFetchAtRef.current = Date.now();
        startTransition(() => {
          setOperationalOrders((prev) =>
            commitOperationalList(prev, mergeRecentIntoOperationalList(prev, recent)),
          );
        });
        setLoading(false);

        window.setTimeout(() => {
          if (!cancelled) mergeOlderOpenInBackground(recent, fetchGenerationRef.current, () => cancelled);
        }, OLDER_OPEN_DEFER_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error('Error al cargar órdenes'));
        setLoading(false);
      }
    };

    void loadOperational();
    return () => {
      cancelled = true;
    };
  }, [mergeOlderOpenInBackground]);

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, scheduleOperationalRefresh)
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleOperationalRefresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastOperationalFetchAtRef.current < MIN_REFRESH_GAP_MS) return;
      void fetchOrders({ silent: true, scope: 'operational' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchOrders({ silent: true, scope: 'operational' });
    }, POLLING_INTERVAL_MS);
    return () => window.clearInterval(interval);
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
      bumpInvalidation();
      startTransition(() => {
        setOperationalOrders((prev) => [newOrder, ...prev]);
      });
      return newOrder;
    },
    [bumpInvalidation],
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
        bumpInvalidation();
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
    [bumpInvalidation, syncBothLists],
  );

  const deleteOrder = useCallback(
    async (orderId: string): Promise<void> => {
      await ordersService.deleteOrder(orderId);
      bumpInvalidation();
      startTransition(() => {
        setOperationalOrders((prev) => prev.filter((order) => order.id !== orderId));
        setFullOrders((prev) => (prev ? prev.filter((order) => order.id !== orderId) : prev));
      });
    },
    [bumpInvalidation],
  );

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
        syncBothLists(orderId, updatedOrder);
      }
      return newStamp;
    },
    [bumpInvalidation, syncBothLists],
  );

  const deleteStamp = useCallback(
    async (stampId: string): Promise<void> => {
      const orderWithStamp = operationalOrders.find((o) => o.items.some((i) => i.id === stampId));
      await ordersService.deleteStamp(stampId);
      bumpInvalidation();
      if (orderWithStamp) {
        const updatedOrder = await ordersService.getOrderById(orderWithStamp.id);
        if (updatedOrder) {
          syncBothLists(orderWithStamp.id, updatedOrder);
        }
      }
    },
    [bumpInvalidation, operationalOrders, syncBothLists],
  );

  const contextValue = useMemo((): OrdersContextValue => {
    const base = {
      operationalOrders,
      fullOrders,
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
    };
    return { ...base, orders: operationalOrders };
  }, [
    operationalOrders,
    fullOrders,
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
  ]);

  return <OrdersContext.Provider value={contextValue}>{children}</OrdersContext.Provider>;
}

export function useOrders(options?: UseOrdersOptions): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) {
    throw new Error('useOrders debe usarse dentro de OrdersProvider');
  }

  const useFull = options?.useFullCatalog ?? false;
  const orders =
    useFull && ctx.fullCatalogLoaded && ctx.fullOrders
      ? ctx.fullOrders
      : ctx.operationalOrders;

  return { ...ctx, orders };
}
