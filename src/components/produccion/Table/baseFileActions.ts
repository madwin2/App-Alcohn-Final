import { ProductionItem } from '@/lib/types/index';
import {
  deleteBaseFile,
  generateFilePath,
  uploadFile,
} from '@/lib/supabase/services/storage.service';

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];

export const BASE_FILE_ACCEPT =
  '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

/** Mensaje si el archivo no es JPG, PNG o PDF. Null si se puede subir. */
export function baseFileRejection(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!ALLOWED_MIME.includes(file.type) && !ALLOWED_EXT.includes(ext)) {
    return 'Solo se permiten archivos JPG, JPEG, PNG o PDF';
  }
  return null;
}

export async function uploadProductionBase(item: ProductionItem, file: File): Promise<string> {
  const filePath = generateFilePath(item.orderId, 'base', file.name, item.id);
  return uploadFile('base', file, filePath);
}

/** Borra del storage el archivo que se ve en la celda. No toca el registro del sello. */
export async function deleteDisplayedProductionBase(item: ProductionItem): Promise<void> {
  const url = item.files?.baseUrl;
  if (!url || typeof url !== 'string') return;
  await deleteBaseFile(url, item.mockupSolicitudId);
}
