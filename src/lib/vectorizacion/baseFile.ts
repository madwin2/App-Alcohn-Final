/** Archivo base útil: el mejorado a mano, o el original del cliente. */
export function baseFileUtil(sello: {
  archivoBase: string;
  archivoBaseMejorado?: string | null;
}): string {
  return sello.archivoBaseMejorado?.trim() || sello.archivoBase;
}
