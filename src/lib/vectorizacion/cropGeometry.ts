export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';

export function clampCrop(crop: CropRect): CropRect {
  const x = Math.min(1, Math.max(0, crop.x));
  const y = Math.min(1, Math.max(0, crop.y));
  const w = Math.min(1 - x, Math.max(0.02, crop.w));
  const h = Math.min(1 - y, Math.max(0.02, crop.h));
  return { x, y, w, h };
}

export function cropFromPixels(
  crop: { x: number; y: number; w: number; h: number },
  source: { w: number; h: number },
): CropRect {
  if (source.w <= 0 || source.h <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  return clampCrop({
    x: crop.x / source.w,
    y: crop.y / source.h,
    w: crop.w / source.w,
    h: crop.h / source.h,
  });
}

export function cropToPixels(crop: CropRect, source: { w: number; h: number }) {
  return {
    x: crop.x * source.w,
    y: crop.y * source.h,
    w: crop.w * source.w,
    h: crop.h * source.h,
  };
}

export function applyHandle(crop: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  const next = { ...crop };
  if (handle === 'move') {
    next.x += dx;
    next.y += dy;
  }
  if (handle.includes('w')) {
    next.x += dx;
    next.w -= dx;
  }
  if (handle.includes('e')) next.w += dx;
  if (handle.includes('n')) {
    next.y += dy;
    next.h -= dy;
  }
  if (handle.includes('s')) next.h += dy;
  return clampCrop(next);
}

export function squareCrop(): CropRect {
  return { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
}
