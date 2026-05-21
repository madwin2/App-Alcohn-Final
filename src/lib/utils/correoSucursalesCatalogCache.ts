import { supabase } from '@/lib/supabase/client';
import { correoSucursalToCatalogRow, type DireccionCatalogRow } from '@/lib/utils/enviosAddressCatalog';

const STORAGE_KEY = 'alcohn_correo_sucursales_catalog_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

type CachePayload = {
  savedAt: number;
  rows: DireccionCatalogRow[];
};

let memoryRows: DireccionCatalogRow[] | null = null;
let memorySavedAt = 0;
let loadPromise: Promise<DireccionCatalogRow[]> | null = null;

function readSessionCache(): DireccionCatalogRow[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.rows?.length || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function writeSessionCache(rows: DireccionCatalogRow[]): void {
  const payload: CachePayload = { savedAt: Date.now(), rows };
  memoryRows = rows;
  memorySavedAt = payload.savedAt;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[correo_sucursales] cache sessionStorage:', e);
  }
}

async function fetchAllFromSupabase(): Promise<DireccionCatalogRow[]> {
  const accumulated: DireccionCatalogRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('correo_sucursales')
      .select('codigo,provincia,localidad,calle,numero')
      .or('activa.is.null,activa.eq.true')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const row of chunk) {
      accumulated.push(
        correoSucursalToCatalogRow({
          codigo: String((row as any).codigo ?? ''),
          provincia: String(row.provincia ?? ''),
          localidad: String(row.localidad ?? ''),
          calle: String(row.calle ?? ''),
          numero: row.numero != null ? String(row.numero) : null,
        }),
      );
    }
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return accumulated;
}

/** Padrón MiCorreo paginado, cacheado en memoria y sessionStorage (24 h). */
export async function loadCorreoSucursalesCatalogCached(): Promise<DireccionCatalogRow[]> {
  if (memoryRows && Date.now() - memorySavedAt < MAX_AGE_MS) {
    return memoryRows;
  }
  const fromSession = readSessionCache();
  if (fromSession?.length) {
    memoryRows = fromSession;
    memorySavedAt = Date.now();
    return fromSession;
  }
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const rows = await fetchAllFromSupabase();
      if (rows.length) writeSessionCache(rows);
      return rows;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export function clearCorreoSucursalesCatalogCache(): void {
  memoryRows = null;
  memorySavedAt = 0;
  loadPromise = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
