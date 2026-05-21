import type { Order } from '@/lib/types';

const STORAGE_KEY = 'alcohn_operational_orders_v1';
const MAX_AGE_MS = 5 * 60 * 1000;

type Payload = { savedAt: number; orders: Order[] };

let memory: Order[] | null = null;
let memoryAt = 0;

export function readOperationalOrdersCache(): Order[] | null {
  if (memory && Date.now() - memoryAt < MAX_AGE_MS) return memory;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Payload;
    if (!p?.orders?.length || Date.now() - p.savedAt > MAX_AGE_MS) return null;
    memory = p.orders;
    memoryAt = p.savedAt;
    return p.orders;
  } catch {
    return null;
  }
}

export function writeOperationalOrdersCache(orders: Order[]): void {
  const payload: Payload = { savedAt: Date.now(), orders };
  memory = orders;
  memoryAt = payload.savedAt;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearOperationalOrdersCache(): void {
  memory = null;
  memoryAt = 0;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
