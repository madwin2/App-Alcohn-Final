const LADO_MAX = 1600;
const CALIDAD = 0.85;

/**
 * Achica una foto para el corcho (lado mayor ≤ 1600 px) antes de subirla.
 * Los GIF se dejan como están para no perder la animación. Si el navegador
 * no puede procesarla, devuelve el archivo original.
 */
export async function achicarImagenCorcho(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && file.size <= 1024 * 1024) {
    bitmap.close();
    return file;
  }

  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  // JPG para fotos; WebP para PNG/WebP así se conserva la transparencia.
  const tipo = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, CALIDAD));
  if (!blob || blob.size >= file.size) return file;

  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
  const base = file.name.replace(/\.[^.]+$/, '') || 'imagen';
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
