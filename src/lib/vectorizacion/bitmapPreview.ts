/** Miniatura liviana para <img src> — los data URL PNG a resolución completa
 *  suelen romper el preview del navegador (límite de tamaño del URL). */
export function canvasToPreviewDataUrl(
  source: CanvasImageSource & { width: number; height: number },
  maxSide = 720,
): string {
  const sw = Math.max(1, source.width);
  const sh = Math.max(1, source.height);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function bitmapToDataUrl(source: {
  bitmap: ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(source.bitmap, 0, 0);
  return canvas.toDataURL('image/png');
}
