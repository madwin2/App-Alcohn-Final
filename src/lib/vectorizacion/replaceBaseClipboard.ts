import { generateFilePath, uploadFile } from '@/lib/supabase/services/storage.service';
import { setArchivoBaseMejorado } from '@/lib/vectorizacion/vectorizacion.service';

/** Lee la primera imagen del portapapeles. null si no hay o el browser no deja. */
export async function readClipboardImageFile(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      return new File([blob], `portapapeles.${ext}`, { type });
    }
    return null;
  } catch {
    return null;
  }
}

/** Sube la imagen del portapapeles como archivo_base_mejorado (sin tocar el original). */
export async function replaceBaseFromClipboard(params: {
  selloId: string;
  orderId: string;
}): Promise<string> {
  const file = await readClipboardImageFile();
  if (!file) {
    throw new Error('No hay imagen en el portapapeles. Copiá una y volvé a intentar.');
  }
  const path = generateFilePath(params.orderId, 'base', `mejorada-${Date.now()}.png`, params.selloId);
  const url = await uploadFile('base', file, path);
  await setArchivoBaseMejorado(params.selloId, url);
  return url;
}
