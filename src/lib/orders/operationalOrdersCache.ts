import type { Order } from '@/lib/types';

const STORAGE_KEY = 'alcohn_operational_orders_v1';
const MAX_AGE_MS = 5 * 60 * 1000;

type Payload = { savedAt: number; orders: Order[]; complete?: boolean };

let memory: Order[] | null = null;
let memoryAt = 0;
let memoryComplete = false;

export function readOperationalOrdersCache(): { orders: Order[]; complete: boolean } | null {
  if (memory && Date.now() - memoryAt < MAX_AGE_MS) {
    return { orders: memory, complete: memoryComplete };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Payload;
    if (!p?.orders?.length || Date.now() - p.savedAt > MAX_AGE_MS) return null;
    memory = p.orders;
    memoryAt = p.savedAt;
    memoryComplete = p.complete ?? false;
    return { orders: p.orders, complete: memoryComplete };
  } catch {
    return null;
  }
}

export function writeOperationalOrdersCache(orders: Order[], complete = false): void {
  const payload: Payload = { savedAt: Date.now(), orders, complete };
  memoryComplete = complete;
  memory = orders;
  memoryAt = payload.savedAt;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

let cacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

let pendingCacheComplete = false;

/** Evita bloquear el hilo principal con JSON.stringify en cada setState. */
export function scheduleOperationalOrdersCacheWrite(
  orders: Order[],
  options?: { delayMs?: number; complete?: boolean },
): void {
  const delayMs = options?.delayMs ?? 800;
  if (options?.complete) pendingCacheComplete = true;
  memory = orders;
  memoryAt = Date.now();
  if (cacheWriteTimer) clearTimeout(cacheWriteTimer);
  cacheWriteTimer = setTimeout(() => {
    cacheWriteTimer = null;
    writeOperationalOrdersCache(orders, pendingCacheComplete);
    pendingCacheComplete = false;
  }, delayMs);
}

export function flushOperationalOrdersCacheWrite(): void {
  if (cacheWriteTimer) {
    clearTimeout(cacheWriteTimer);
    cacheWriteTimer = null;
  }
  if (memory) writeOperationalOrdersCache(memory);
}

export function clearOperationalOrdersCache(): void {
  if (cacheWriteTimer) {
    clearTimeout(cacheWriteTimer);
    cacheWriteTimer = null;
  }
  memory = null;
  memoryAt = 0;
  memoryComplete = false;
  pendingCacheComplete = false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
