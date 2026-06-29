import { supabase } from '@/lib/supabase/client';

export type StorageRef = {
  bucket: string;
  path: string;
};

export const PRIVATE_WEB_BUCKETS = ['logos-web', 'mockups-web'] as const;

export function parseBucketFromStorageUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\//i);
  return match?.[1] ?? null;
}

export function parsePathFromStorageUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|#|$)/i);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

export function isPrivateWebStorageUrl(url: string): boolean {
  const bucket = parseBucketFromStorageUrl(url);
  return bucket !== null && (PRIVATE_WEB_BUCKETS as readonly string[]).includes(bucket);
}

export function resolveStorageRefFromUrl(url: string): StorageRef | null {
  const path = parsePathFromStorageUrl(url);
  const bucket = parseBucketFromStorageUrl(url);
  if (!path || !bucket) return null;
  return { bucket, path };
}

/** URL para <img>: directa en buckets públicos; firmada en logos-web / mockups-web. */
export async function resolveStorageDisplayUrl(url: string): Promise<string> {
  if (!isPrivateWebStorageUrl(url)) return url;

  const ref = resolveStorageRefFromUrl(url);
  if (!ref) throw new Error('URL de storage inválida');

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('No se pudo abrir el archivo web');
  }
  return data.signedUrl;
}

/** Descarga vía Storage API (buckets privados web). */
export async function downloadPrivateStorageBlob(url: string): Promise<Blob> {
  const ref = resolveStorageRefFromUrl(url);
  if (!ref) throw new Error('URL de storage inválida');

  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error) throw error;
  if (!data) throw new Error('No se encontró el archivo en storage');
  return data;
}
