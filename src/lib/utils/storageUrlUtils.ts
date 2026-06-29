import { supabase } from '@/lib/supabase/client';

export type StorageRef = {
  bucket: string;
  path: string;
};

export const PRIVATE_WEB_BUCKETS = ['logos-web', 'mockups-web'] as const;

const SUPABASE_HOST_RE = /supabase\.co/i;
const WEB_STORAGE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

export function parseBucketFromStorageUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\//i);
  return match?.[1] ?? null;
}

export function parsePathFromStorageUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|#|$)/i);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

/** Ruta relativa guardada por la web (sin dominio Supabase). */
export function extractRawStoragePath(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (parseBucketFromStorageUrl(trimmed) && parsePathFromStorageUrl(trimmed)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (SUPABASE_HOST_RE.test(parsed.hostname)) return null;
      const path = parsed.pathname.replace(/^\/+/, '');
      return path || null;
    } catch {
      return null;
    }
  }

  return trimmed.replace(/^\/+/, '') || null;
}

export function isWebStoragePath(path: string): boolean {
  return WEB_STORAGE_PATH_RE.test(path) || path.includes('/');
}

function guessBucketForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('mockup') || lower.includes('/cuero/') || lower.includes('/madera/')) {
    return 'mockups-web';
  }
  return 'logos-web';
}

export function isPrivateWebStorageUrl(url: string): boolean {
  const bucket = parseBucketFromStorageUrl(url);
  if (bucket !== null && (PRIVATE_WEB_BUCKETS as readonly string[]).includes(bucket)) {
    return true;
  }

  const rawPath = extractRawStoragePath(url);
  return rawPath !== null && isWebStoragePath(rawPath);
}

export function resolveStorageRefFromUrl(url: string): StorageRef | null {
  const path = parsePathFromStorageUrl(url);
  const bucket = parseBucketFromStorageUrl(url);
  if (path && bucket) return { bucket, path };

  const rawPath = extractRawStoragePath(url);
  if (rawPath && isWebStoragePath(rawPath)) {
    return { bucket: guessBucketForPath(rawPath), path: rawPath };
  }

  return null;
}

type MockupAssetRow = {
  origen?: string | null;
  archivo_base_path?: string | null;
  archivo_base_url?: string | null;
  imagen_optimizada_path?: string | null;
  imagen_optimizada_url?: string | null;
};

function resolveRefFromMockupFields(
  path: string | null | undefined,
  url: string | null | undefined,
  origen: string | null | undefined,
): StorageRef | null {
  const storedPath = String(path ?? '').trim();
  const storedUrl = String(url ?? '').trim();
  const resolvedPath = storedPath || (storedUrl ? parsePathFromStorageUrl(storedUrl) : null);
  if (!resolvedPath) return null;

  const bucket =
    (storedUrl ? parseBucketFromStorageUrl(storedUrl) : null) ??
    (origen === 'web' ? 'logos-web' : 'foto');

  return { bucket, path: resolvedPath };
}

async function fetchMockupBaseStorageRef(mockupSolicitudId: string): Promise<StorageRef | null> {
  const { data, error } = await supabase
    .from('mockup_solicitudes')
    .select(
      'origen, archivo_base_path, archivo_base_url, imagen_optimizada_path, imagen_optimizada_url',
    )
    .eq('id', mockupSolicitudId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as MockupAssetRow;

  // Para pedidos web: el archivo útil en producción es el optimizado (el del mockup).
  return (
    resolveRefFromMockupFields(row.imagen_optimizada_path, row.imagen_optimizada_url, row.origen) ??
    resolveRefFromMockupFields(row.archivo_base_path, row.archivo_base_url, row.origen)
  );
}

export async function resolveBaseFileStorageRef(
  url: string,
  mockupSolicitudId?: string | null,
): Promise<StorageRef | null> {
  // Pedidos web: archivo_base en sellos suele ser una ruta incorrecta del carrito;
  // el path real está en mockup_solicitudes.archivo_base_path.
  if (mockupSolicitudId) {
    const fromMockup = await fetchMockupBaseStorageRef(mockupSolicitudId);
    if (fromMockup) return fromMockup;
  }

  return resolveStorageRefFromUrl(url);
}

async function createDisplayUrlForRef(ref: StorageRef): Promise<string> {
  if (ref.bucket === 'foto' || ref.bucket === 'base') {
    return supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
  }

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('No se pudo abrir el archivo web');
  }
  return data.signedUrl;
}

/** URL para <img>: directa en buckets públicos; firmada en logos-web / mockups-web. */
export async function resolveStorageDisplayUrl(
  url: string,
  mockupSolicitudId?: string | null,
): Promise<string> {
  if (!isPrivateWebStorageUrl(url) && !mockupSolicitudId) return url;

  const ref = await resolveBaseFileStorageRef(url, mockupSolicitudId);
  if (!ref) {
    if (!isPrivateWebStorageUrl(url)) return url;
    throw new Error('URL de storage inválida');
  }

  return createDisplayUrlForRef(ref);
}

/** Descarga vía Storage API (buckets privados web o rutas relativas). */
export async function downloadPrivateStorageBlob(
  url: string,
  mockupSolicitudId?: string | null,
): Promise<Blob> {
  const ref = await resolveBaseFileStorageRef(url, mockupSolicitudId);
  if (!ref) throw new Error('URL de storage inválida');

  if (ref.bucket === 'foto' || ref.bucket === 'base') {
    const publicUrl = supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
    const response = await fetch(publicUrl);
    if (!response.ok) throw new Error('Error al descargar el archivo');
    return response.blob();
  }

  try {
    const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
    if (error) throw error;
    if (!data) throw new Error('No se encontró el archivo en storage');
    return data;
  } catch (storageError) {
    // Respaldo: URL firmada de Supabase aún vigente en archivo_base
    const trimmed = url.trim();
    if (
      /^https?:\/\//i.test(trimmed) &&
      SUPABASE_HOST_RE.test(trimmed) &&
      parseBucketFromStorageUrl(trimmed)
    ) {
      const response = await fetch(trimmed);
      if (response.ok) return response.blob();
    }
    throw storageError;
  }
}
