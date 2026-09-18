import { describe, expect, it } from 'vitest';
import {
  packSheets,
  scalePlacement,
  sheetUpscale,
  SHEET_GUTTER_PX,
  SHEET_MAX_ITEMS,
  SHEET_MAX_PIXELS,
} from './sheetPacking';

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe('packSheets', () => {
  it('empaqueta 8 logos de 500×500 en 1 hoja', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, w: 500, h: 500 }));
    const sheets = packSheets(items);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cells).toHaveLength(8);
    expect(sheets[0].width * sheets[0].height).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
  });

  it('no solapa celdas y respeta el gutter', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, w: 500, h: 500 }));
    const [sheet] = packSheets(items);
    for (let i = 0; i < sheet.cells.length; i += 1) {
      const a = sheet.cells[i];
      expect(a.x).toBeGreaterThanOrEqual(SHEET_GUTTER_PX);
      expect(a.y).toBeGreaterThanOrEqual(SHEET_GUTTER_PX);
      expect(a.x + a.w).toBeLessThanOrEqual(sheet.width - SHEET_GUTTER_PX + 0.01);
      expect(a.y + a.h).toBeLessThanOrEqual(sheet.height - SHEET_GUTTER_PX + 0.01);
      for (let j = i + 1; j < sheet.cells.length; j += 1) {
        const b = sheet.cells[j];
        expect(overlaps(a, b)).toBe(false);
        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        if (gapX > 0 && gapY === 0) expect(gapX).toBeGreaterThanOrEqual(SHEET_GUTTER_PX);
        if (gapY > 0 && gapX === 0) expect(gapY).toBeGreaterThanOrEqual(SHEET_GUTTER_PX);
      }
    }
  });

  it('manda sola una imagen que ya supera el tope de píxeles', () => {
    const giant = { id: 'g', w: 3000, h: 3000 };
    const small = { id: 's', w: 200, h: 200 };
    const sheets = packSheets([giant, small]);
    expect(sheets[0].cells).toHaveLength(1);
    expect(sheets[0].cells[0].imageId).toBe('g');
    expect(sheets.some((sheet) => sheet.cells.some((cell) => cell.imageId === 's'))).toBe(true);
  });

  it('respeta SHEET_MAX_ITEMS', () => {
    const items = Array.from({ length: SHEET_MAX_ITEMS + 3 }, (_, i) => ({
      id: `i${i}`,
      w: 80,
      h: 80,
    }));
    const sheets = packSheets(items);
    expect(sheets.length).toBeGreaterThan(1);
    expect(Math.max(...sheets.map((sheet) => sheet.cells.length))).toBeLessThanOrEqual(SHEET_MAX_ITEMS);
  });
});

describe('scalePlacement', () => {
  it('después de redondear el upscale no supera SHEET_MAX_PIXELS', () => {
    const sheet = {
      width: 1800,
      height: 890,
      cells: [{ imageId: 'a', x: 24, y: 24, w: 1752, h: 842 }],
    };
    const scaled = scalePlacement(sheet, sheetUpscale(sheet.width, sheet.height));
    expect(scaled.width * scaled.height).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
  });

  it('achica la hoja 2521×1248 que se pasa 380 px del tope', () => {
    const sheet = {
      width: 2521,
      height: 1248,
      cells: [{ imageId: 'a', x: 24, y: 24, w: 2473, h: 1200 }],
    };
    expect(sheet.width * sheet.height).toBeGreaterThan(SHEET_MAX_PIXELS);
    const fitted = scalePlacement(sheet, 1);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
    expect(fitted.width).toBeGreaterThan(2500);
    expect(fitted.height).toBeGreaterThan(1230);
  });

  it('ningún upscale redondeado se pasa del tope', () => {
    for (let w = 400; w <= 2000; w += 73) {
      for (let h = 400; h <= 1600; h += 67) {
        const factor = sheetUpscale(w, h);
        const scaled = scalePlacement({ width: w, height: h, cells: [] }, factor);
        expect(scaled.width * scaled.height).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
      }
    }
  });
});
