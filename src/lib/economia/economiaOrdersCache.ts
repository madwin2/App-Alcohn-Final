import type { Order } from '@/lib/types';

const STORAGE_KEY = 'alcohn_economia_orders_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type EconomiaOrdersCachePayload = {
  savedAt: number;
  orders: Order[];
};

let memoryCache: Order[] | null = null;
let memorySavedAt = 0;

export function readEconomiaOrdersCache(): Order[] | null {
  if (memoryCache && Date.now() - memorySavedAt < MAX_AGE_MS) {
    return memoryCache;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EconomiaOrdersCachePayload;
    if (!parsed?.orders?.length || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      return null;
    }
    memoryCache = parsed.orders;
    memorySavedAt = parsed.savedAt;
    return parsed.orders;
  } catch {
    return null;
  }
}

export function writeEconomiaOrdersCache(orders: Order[]): void {
  const payload: EconomiaOrdersCachePayload = {
    savedAt: Date.now(),
    orders,
  };
  memoryCache = orders;
  memorySavedAt = payload.savedAt;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[economia] No se pudo guardar cache en sessionStorage:', e);
  }
}

export function clearEconomiaOrdersCache(): void {
  memoryCache = null;
  memorySavedAt = 0;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
