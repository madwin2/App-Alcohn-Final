import { scalePlacement, sheetUpscale } from './sheetPacking';
import type { PackedSheet, PreparedImage } from './types';

export async function composeSheet(
  sheet: PackedSheet,
  images: Map<string, PreparedImage>,
  opts: { upscale: boolean },
): Promise<{ blob: Blob; placement: PackedSheet }> {
  const factor = opts.upscale ? sheetUpscale(sheet.width, sheet.height) : 1;
  const placement = scalePlacement(sheet, factor);
  const canvas = document.createElement('canvas');
  canvas.width = placement.width;
  canvas.height = placement.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo componer la hoja');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = factor > 1;
  ctx.imageSmoothingQuality = 'high';

  for (const cell of placement.cells) {
    const image = images.get(cell.imageId);
    if (!image || image.empty) continue;
    ctx.drawImage(image.canvas, cell.x, cell.y, cell.w, cell.h);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('No se pudo exportar la hoja a PNG'));
    }, 'image/png');
  });

  return { blob, placement };
}
