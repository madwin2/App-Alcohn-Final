import type { ReviewItem } from './types';

const DB_NAME = 'alcohn-vectorizacion';
const DB_VERSION = 1;
const STORE_NAME = 'reviewQueue';
const QUEUE_KEY = 'pending';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function isReviewItem(value: unknown): value is ReviewItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.selloId === 'string' &&
    typeof item.orderId === 'string' &&
    typeof item.designName === 'string' &&
    typeof item.svg === 'string' &&
    typeof item.beforeDataUrl === 'string' &&
    typeof item.requestedWidthMm === 'number' &&
    typeof item.requestedHeightMm === 'number' &&
    typeof item.mode === 'string'
  );
}

/** Carga la cola de revisión persistida en este navegador. */
export async function loadReviewQueue(): Promise<ReviewItem[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(QUEUE_KEY);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB get failed'));
      request.onsuccess = () => {
        const raw = request.result;
        if (!Array.isArray(raw)) {
          resolve([]);
          return;
        }
        resolve(raw.filter(isReviewItem));
      };
      tx.oncomplete = () => db.close();
    });
  } catch (error) {
    console.warn('[vectorizacion] No se pudo leer la cola de revisión:', error);
    return [];
  }
}

/** Guarda (o vacía) la cola de revisión en IndexedDB. */
export async function saveReviewQueue(items: ReviewItem[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(items, QUEUE_KEY);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB put failed'));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
  } catch (error) {
    console.warn('[vectorizacion] No se pudo guardar la cola de revisión:', error);
  }
}
