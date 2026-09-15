import type { PixelBuffer } from './types';

export type CropReason = 'ok' | 'sin-margen' | 'fondo-no-detectado' | 'vacia';

export interface ContentBBox {
  x: number;
  y: number;
  w: number;
  h: number;
  reason: CropReason;
}

export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Luminancia aplanada sobre blanco: mata el caso "PNG transparente". */
export function flatLum(d: Uint8ClampedArray, i: number): number {
  const a = d[i + 3] / 255;
  return luminance(d[i], d[i + 1], d[i + 2]) * a + 255 * (1 - a);
}

/** Fondo = mediana del anillo de 2 px del borde. Robusto a esquinas raras. */
export function sampleBorderBackground(data: PixelBuffer): { bg: number; dispersion: number } {
  const vals: number[] = [];
  const { width: w, height: h, data: d } = data;
  if (w <= 0 || h <= 0) return { bg: 255, dispersion: 0 };

  const push = (x: number, y: number) => {
    const xx = Math.max(0, Math.min(w - 1, x));
    const yy = Math.max(0, Math.min(h - 1, y));
    vals.push(flatLum(d, (yy * w + xx) * 4));
  };

  const ring = Math.min(2, Math.floor(Math.min(w, h) / 2));
  for (let r = 0; r < ring; r += 1) {
    for (let x = 0; x < w; x += 1) {
      push(x, r);
      push(x, h - 1 - r);
    }
    for (let y = 0; y < h; y += 1) {
      push(r, y);
      push(w - 1 - r, y);
    }
  }

  vals.sort((a, b) => a - b);
  const bg = vals[Math.floor(vals.length / 2)] ?? 255;
  const p10 = vals[Math.floor(vals.length * 0.1)] ?? bg;
  const p90 = vals[Math.floor(vals.length * 0.9)] ?? bg;
  return { bg, dispersion: p90 - p10 };
}

function findSpan(ink: Int32Array, min: number): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < ink.length; i += 1) {
    if (ink[i] >= min) {
      if (start < 0) start = i;
      end = i;
    }
  }
  if (start < 0 || end < start) return null;
  return { start, end };
}

function bboxAtThreshold(
  data: PixelBuffer,
  bg: number,
  threshold: number,
): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data: d } = data;
  const rowInk = new Int32Array(h);
  const colInk = new Int32Array(w);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (Math.abs(flatLum(d, (y * w + x) * 4) - bg) > threshold) {
        rowInk[y] += 1;
        colInk[x] += 1;
      }
    }
  }

  const rowMin = Math.max(2, Math.round(w * 0.0005));
  const colMin = Math.max(2, Math.round(h * 0.0005));
  const rows = findSpan(rowInk, rowMin);
  const cols = findSpan(colInk, colMin);
  if (!rows || !cols) return null;
  return {
    x: cols.start,
    y: rows.start,
    w: cols.end - cols.start + 1,
    h: rows.end - rows.start + 1,
  };
}

/**
 * Bbox de contenido con poda de ruido, mediana de borde y escalada de umbral.
 * Aplana alpha sobre blanco para que un PNG transparente no cuente el fondo como tinta.
 */
export function computeContentBBox(data: PixelBuffer, threshold = 12): ContentBBox | null {
  if (data.width <= 0 || data.height <= 0) return null;

  const { bg, dispersion } = sampleBorderBackground(data);
  const area = data.width * data.height;
  const thresholds = [threshold, 24, 40];
  let last: { x: number; y: number; w: number; h: number } | null = null;

  for (const t of thresholds) {
    const bbox = bboxAtThreshold(data, bg, t);
    if (!bbox) {
      return last
        ? { ...last, reason: last.w * last.h / area > 0.98 ? 'sin-margen' : 'ok' }
        : null;
    }
    last = bbox;
    if ((bbox.w * bbox.h) / area <= 0.98) {
      return { ...bbox, reason: 'ok' };
    }
  }

  if (!last) return null;
  if (dispersion > 40) {
    return { x: 0, y: 0, w: data.width, h: data.height, reason: 'fondo-no-detectado' };
  }
  return { ...last, reason: 'sin-margen' };
}

export function expandBBox(
  bbox: { x: number; y: number; w: number; h: number },
  imgW: number,
  imgH: number,
  paddingPct: number,
): { x: number; y: number; w: number; h: number } {
  const pad = Math.min(64, Math.max(2, Math.round(Math.min(bbox.w, bbox.h) * Math.max(0, paddingPct))));
  const x = Math.max(0, bbox.x - pad);
  const y = Math.max(0, bbox.y - pad);
  const x2 = Math.min(imgW, bbox.x + bbox.w + pad);
  const y2 = Math.min(imgH, bbox.y + bbox.h + pad);
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

/** Estira niveles conservando el antialias (no binariza). */
export function applyLevels(data: PixelBuffer, blackPoint: number, whitePoint: number): void {
  const span = Math.max(1, whitePoint - blackPoint);
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const v = data.data[i + c];
      const t = Math.min(1, Math.max(0, (v - blackPoint) / span));
      data.data[i + c] = Math.round(t * 255);
    }
  }
}

/** Aplana alpha sobre blanco para que la miniatura = lo que se manda a Vectorizer. */
export function flattenAlphaOnWhite(data: PixelBuffer): void {
  for (let i = 0; i < data.data.length; i += 4) {
    const a = data.data[i + 3] / 255;
    data.data[i] = Math.round(data.data[i] * a + 255 * (1 - a));
    data.data[i + 1] = Math.round(data.data[i + 1] * a + 255 * (1 - a));
    data.data[i + 2] = Math.round(data.data[i + 2] * a + 255 * (1 - a));
    data.data[i + 3] = 255;
  }
}

export function cropBuffer(
  data: PixelBuffer,
  crop: { x: number; y: number; w: number; h: number },
): PixelBuffer {
  const x0 = Math.max(0, Math.floor(crop.x));
  const y0 = Math.max(0, Math.floor(crop.y));
  const w = Math.max(1, Math.min(data.width - x0, Math.floor(crop.w)));
  const h = Math.max(1, Math.min(data.height - y0, Math.floor(crop.h)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const src = ((y0 + y) * data.width + x0) * 4;
    out.set(data.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}
