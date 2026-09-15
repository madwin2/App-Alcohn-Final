import {
  downloadPrivateStorageBlob,
  resolveBaseFileStorageRef,
} from '@/lib/utils/storageUrlUtils';
import { supabase } from '@/lib/supabase/client';
import type { SourceImage } from './types';

const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/tif',
  'image/x-windows-bmp',
]);

const ACCEPTED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff']);

export function isAcceptedImageFile(file: File): boolean {
  if (file.type && ACCEPTED_MIME.has(file.type.toLowerCase())) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ACCEPTED_EXT.has(ext);
}

export function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo leer la imagen');
    ctx.drawImage(image, 0, 0);
    return canvas as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sourceFromFile(file: File, id?: string): Promise<SourceImage> {
  const bitmap = await bitmapFromBlob(file);
  return {
    id: id ?? crypto.randomUUID(),
    name: fileStem(file.name),
    bitmap,
    naturalWidth: bitmap.width,
    naturalHeight: bitmap.height,
  };
}

export async function sourceFromSello(params: {
  selloId: string;
  orderId: string;
  name: string;
  archivoBase: string;
  mockupSolicitudId: string | null;
}): Promise<SourceImage> {
  const ref = await resolveBaseFileStorageRef(params.archivoBase, params.mockupSolicitudId);
  let blob: Blob;
  if (ref) {
    blob = await downloadPrivateStorageBlob(params.archivoBase, params.mockupSolicitudId);
  } else if (/^https?:\/\//i.test(params.archivoBase)) {
    const response = await fetch(params.archivoBase);
    if (!response.ok) throw new Error(`No se pudo bajar el archivo base (${response.status})`);
    blob = await response.blob();
  } else {
    const { data, error } = await supabase.storage.from('base').download(params.archivoBase);
    if (error || !data) throw new Error('No se encontró el archivo base');
    blob = data;
  }

  const bitmap = await bitmapFromBlob(blob);
  return {
    id: params.selloId,
    name: params.name,
    bitmap,
    naturalWidth: bitmap.width,
    naturalHeight: bitmap.height,
    selloId: params.selloId,
    orderId: params.orderId,
  };
}
