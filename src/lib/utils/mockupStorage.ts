import { supabase } from '@/lib/supabase/client';
import type { MockupSolicitudRow } from '@/lib/supabase/services/mockupSolicitudes.service';
import { downloadFile } from '@/lib/supabase/services/storage.service';
import {
  downloadPrivateStorageBlob,
  parseBucketFromStorageUrl,
  parsePathFromStorageUrl,
  resolveStorageDisplayUrl as resolveStorageDisplayUrlFromUrl,
  type StorageRef,
} from '@/lib/utils/storageUrlUtils';

export type MockupAssetKind = 'base' | 'optimized' | 'mockup_cuero' | 'mockup_madera';

export type MockupStorageRef = StorageRef;

export { parseBucketFromStorageUrl, parsePathFromStorageUrl };

const PATH_BY_KIND: Record<MockupAssetKind, keyof MockupSolicitudRow> = {
  base: 'archivo_base_path',
  optimized: 'imagen_optimizada_path',
  mockup_cuero: 'mockup_cuero_path',
  mockup_madera: 'mockup_madera_path',
};

const URL_BY_KIND: Record<MockupAssetKind, keyof MockupSolicitudRow> = {
  base: 'archivo_base_url',
  optimized: 'imagen_optimizada_url',
  mockup_cuero: 'mockup_cuero_url',
  mockup_madera: 'mockup_madera_url',
};

function defaultBucketForKind(row: MockupSolicitudRow, kind: MockupAssetKind): string {
  if (row.origen === 'web') {
    return kind === 'mockup_cuero' || kind === 'mockup_madera' ? 'mockups-web' : 'logos-web';
  }
  return 'foto';
}

/** Resuelve bucket + path para un asset de mockup (app → foto; web → logos-web / mockups-web). */
export function resolveMockupStorageRef(
  row: Pick<
    MockupSolicitudRow,
    | 'origen'
    | 'archivo_base_path'
    | 'archivo_base_url'
    | 'imagen_optimizada_path'
    | 'imagen_optimizada_url'
    | 'mockup_cuero_path'
    | 'mockup_cuero_url'
    | 'mockup_madera_path'
    | 'mockup_madera_url'
  >,
  kind: MockupAssetKind,
): MockupStorageRef | null {
  const pathKey = PATH_BY_KIND[kind];
  const urlKey = URL_BY_KIND[kind];
  const storedPath = String(row[pathKey] ?? '').trim();
  const storedUrl = String(row[urlKey] ?? '').trim();

  const path = storedPath || (storedUrl ? parsePathFromStorageUrl(storedUrl) : null);
  if (!path) return null;

  const bucket =
    (storedUrl ? parseBucketFromStorageUrl(storedUrl) : null) ??
    defaultBucketForKind(row as MockupSolicitudRow, kind);

  return { bucket, path };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = window.URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
}

/** Descarga vía Storage API (funciona con buckets privados web). */
export async function downloadMockupStorageAsset(
  ref: MockupStorageRef,
  filename: string,
): Promise<void> {
  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error) throw error;
  if (!data) throw new Error('No se encontró el archivo en storage');
  triggerBlobDownload(data, filename);
}

export async function downloadMockupAsset(
  row: MockupSolicitudRow,
  kind: MockupAssetKind,
  filename: string,
): Promise<void> {
  const ref = resolveMockupStorageRef(row, kind);
  if (!ref) throw new Error('Sin archivo en esta solicitud');

  if (ref.bucket === 'foto') {
    const publicUrl = supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
    await downloadFile(publicUrl, filename);
    return;
  }

  await downloadMockupStorageAsset(ref, filename);
}

/** URL para <img>: pública en foto; firmada en buckets web privados. */
export async function resolveMockupAssetDisplayUrl(
  row: MockupSolicitudRow,
  kind: MockupAssetKind,
): Promise<string | null> {
  const ref = resolveMockupStorageRef(row, kind);
  if (!ref) return null;

  if (ref.bucket === 'foto') {
    return supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
  }

  const storedUrl = String(row[URL_BY_KIND[kind]] ?? '').trim();
  if (storedUrl) {
    return resolveStorageDisplayUrlFromUrl(storedUrl);
  }

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('No se pudo abrir el archivo web');
  }
  return data.signedUrl;
}

export async function fetchMockupAssetAsFile(
  row: MockupSolicitudRow,
  kind: MockupAssetKind,
  fileName: string,
): Promise<File> {
  const ref = resolveMockupStorageRef(row, kind);
  if (!ref) throw new Error('Sin archivo en esta solicitud');

  if (ref.bucket === 'foto') {
    const publicUrl = supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
    const response = await fetch(publicUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar el archivo guardado');
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/png' });
  }

  const storedUrl = String(row[URL_BY_KIND[kind]] ?? '').trim();
  if (storedUrl) {
    const blob = await downloadPrivateStorageBlob(storedUrl);
    return new File([blob], fileName, { type: blob.type || 'image/png' });
  }

  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error) throw error;
  if (!data) throw new Error('No se encontró el archivo en storage');
  return new File([data], fileName, { type: data.type || 'image/png' });
}
