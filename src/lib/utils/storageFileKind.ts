export type StorageFileKind = 'pdf' | 'ai' | 'eps' | 'svg' | 'image' | 'other';

/** Infiere el tipo de archivo desde la URL pública de Storage (path o query). */
export function storageFileKindFromUrl(url: string): StorageFileKind {
  const lower = decodeURIComponent(url).toLowerCase();
  const webLogoBucket = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/(logos-web|mockups-web)\//i.test(
    lower,
  );
  if (webLogoBucket) {
    if (/\.pdf(\?|#|$)/i.test(lower)) return 'pdf';
    if (/\.svg(\?|#|$)/i.test(lower)) return 'svg';
    return 'image';
  }
  if (/\.pdf(\?|#|$)/i.test(lower)) return 'pdf';
  if (/\.ai(\?|#|$)/i.test(lower)) return 'ai';
  if (/\.eps(\?|#|$)/i.test(lower)) return 'eps';
  if (/\.svg(\?|#|$)/i.test(lower)) return 'svg';
  if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(lower)) return 'image';
  return 'other';
}

/** Formatos sin miniatura fiable en la tabla (mostrar ícono de archivo cargado). */
export function isNonThumbnailStorageKind(kind: StorageFileKind): boolean {
  return kind === 'pdf' || kind === 'ai' || kind === 'eps' || kind === 'svg' || kind === 'other';
}

export function storageFileKindLabel(kind: StorageFileKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'ai':
      return 'AI';
    case 'eps':
      return 'EPS';
    case 'svg':
      return 'SVG';
    case 'image':
      return 'Imagen';
    default:
      return 'Archivo';
  }
}
