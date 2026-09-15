import type { PackedSheet } from './types';

export const SHEET_MAX_PIXELS = 3_145_828;
export const SHEET_GUTTER_PX = 24;
export const SHEET_MAX_ITEMS = 12;
export const UPSCALE_CAP = 2;

export interface PackItem {
  id: string;
  w: number;
  h: number;
}

function packAtWidth(items: PackItem[], width: number): PackedSheet | null {
  const g = SHEET_GUTTER_PX;
  if (items.some((item) => item.w + 2 * g > width + 1e-6)) return null;

  let x = g;
  let y = g;
  let rowH = 0;
  const cells = [];

  for (const item of items) {
    if (x > g && x + item.w + g > width) {
      x = g;
      y += rowH + g;
      rowH = 0;
    }
    cells.push({ imageId: item.id, x, y, w: item.w, h: item.h });
    x += item.w + g;
    rowH = Math.max(rowH, item.h);
  }

  const height = y + rowH + g;
  if (height <= 0 || width <= 0) return null;
  return { width, height, cells };
}

function candidateWidths(items: PackItem[]): number[] {
  const g = SHEET_GUTTER_PX;
  const maxItemW = Math.max(...items.map((item) => item.w));
  const lo = maxItemW + 2 * g;
  const hi = Math.max(lo, Math.floor(Math.sqrt(SHEET_MAX_PIXELS * 2)));
  const widths = new Set<number>([lo, hi]);

  for (let n = 1; n <= items.length; n += 1) {
    const row = [...items].sort((a, b) => b.w - a.w).slice(0, n);
    const width = row.reduce((sum, item) => sum + item.w, 0) + (n + 1) * g;
    if (width >= lo && width <= hi) widths.add(Math.round(width));
  }
  for (let i = 0; i <= 32; i += 1) {
    widths.add(Math.round(lo + ((hi - lo) * i) / 32));
  }
  return [...widths].sort((a, b) => a - b);
}

function sheetForSingle(item: PackItem): PackedSheet {
  const g = SHEET_GUTTER_PX;
  return {
    width: item.w + 2 * g,
    height: item.h + 2 * g,
    cells: [{ imageId: item.id, x: g, y: g, w: item.w, h: item.h }],
  };
}

function bestSheetFor(items: PackItem[]): PackedSheet | null {
  if (!items.length) return null;
  if (items.length === 1) return sheetForSingle(items[0]);

  let best: PackedSheet | null = null;
  for (const width of candidateWidths(items)) {
    const packed = packAtWidth(items, width);
    if (!packed) continue;
    if (packed.width * packed.height > SHEET_MAX_PIXELS) continue;
    const bestArea = best ? best.width * best.height : Infinity;
    const area = packed.width * packed.height;
    if (!best || packed.cells.length > best.cells.length || (packed.cells.length === best.cells.length && area < bestArea)) {
      best = packed;
    }
  }
  return best;
}

function itemArea(item: PackItem): number {
  return (item.w + 2 * SHEET_GUTTER_PX) * (item.h + 2 * SHEET_GUTTER_PX);
}

export function packSheets(items: PackItem[]): PackedSheet[] {
  const remaining = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets: PackedSheet[] = [];

  while (remaining.length) {
    if (itemArea(remaining[0]) > SHEET_MAX_PIXELS) {
      sheets.push(sheetForSingle(remaining.shift()!));
      continue;
    }

    const batchMax = Math.min(SHEET_MAX_ITEMS, remaining.length);
    let packed: PackedSheet | null = null;
    let used = 0;
    for (let n = batchMax; n >= 1; n -= 1) {
      const attempt = bestSheetFor(remaining.slice(0, n));
      if (attempt && attempt.cells.length === n) {
        packed = attempt;
        used = n;
        break;
      }
    }
    if (!packed) {
      packed = sheetForSingle(remaining[0]);
      used = 1;
    }
    sheets.push(packed);
    remaining.splice(0, used);
  }

  return sheets;
}

export function sheetUpscale(width: number, height: number, cap = UPSCALE_CAP): number {
  const area = width * height;
  if (area <= 0) return 1;
  return Math.min(Math.sqrt(SHEET_MAX_PIXELS / area), cap);
}

export function scalePlacement(sheet: PackedSheet, factor: number): PackedSheet {
  if (factor === 1) return sheet;
  return {
    width: Math.round(sheet.width * factor),
    height: Math.round(sheet.height * factor),
    cells: sheet.cells.map((cell) => ({
      imageId: cell.imageId,
      x: Math.round(cell.x * factor),
      y: Math.round(cell.y * factor),
      w: Math.round(cell.w * factor),
      h: Math.round(cell.h * factor),
    })),
  };
}
