import { describe, expect, it } from 'vitest';
import { applyLevels, computeContentBBox, expandBBox } from './imagePrep';
import type { PixelBuffer } from './types';

function buffer(width: number, height: number, fill: [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height };
}

function setPx(buf: PixelBuffer, x: number, y: number, rgba: [number, number, number, number]) {
  const i = (y * buf.width + x) * 4;
  buf.data.set(rgba, i);
}

describe('imagePrep', () => {
  it('encuentra el bbox de un bloque negro sobre blanco', () => {
    const img = buffer(20, 20, [255, 255, 255, 255]);
    for (let y = 5; y <= 12; y += 1) {
      for (let x = 4; x <= 10; x += 1) {
        setPx(img, x, y, [0, 0, 0, 255]);
      }
    }
    const bbox = computeContentBBox(img);
    expect(bbox).toMatchObject({ x: 4, y: 5, w: 7, h: 8, reason: 'ok' });
  });

  it('recorta un PNG con fondo transparente al contenido', () => {
    const img = buffer(40, 40, [0, 0, 0, 0]);
    for (let y = 10; y <= 25; y += 1) {
      for (let x = 8; x <= 22; x += 1) {
        setPx(img, x, y, [0, 0, 0, 255]);
      }
    }
    const bbox = computeContentBBox(img);
    expect(bbox?.reason).toBe('ok');
    expect(bbox?.x).toBe(8);
    expect(bbox?.y).toBe(10);
    expect(bbox?.w).toBe(15);
    expect(bbox?.h).toBe(16);
  });

  it('poda una mota suelta de 1 px en la esquina', () => {
    const img = buffer(40, 40, [255, 255, 255, 255]);
    for (let y = 12; y <= 28; y += 1) {
      for (let x = 12; x <= 28; x += 1) {
        setPx(img, x, y, [0, 0, 0, 255]);
      }
    }
    setPx(img, 0, 0, [0, 0, 0, 255]);
    const bbox = computeContentBBox(img);
    expect(bbox).toMatchObject({ x: 12, y: 12, w: 17, h: 17, reason: 'ok' });
  });

  it('recorta logo blanco sobre fondo negro', () => {
    const img = buffer(30, 30, [0, 0, 0, 255]);
    for (let y = 8; y <= 20; y += 1) {
      for (let x = 6; x <= 18; x += 1) {
        setPx(img, x, y, [255, 255, 255, 255]);
      }
    }
    const bbox = computeContentBBox(img);
    expect(bbox).toMatchObject({ x: 6, y: 8, w: 13, h: 13, reason: 'ok' });
  });

  it('marca vacía una imagen toda blanca', () => {
    const img = buffer(10, 10, [255, 255, 255, 255]);
    expect(computeContentBBox(img)).toBeNull();
  });

  it('imagen ya ajustada → sin-margen', () => {
    // Anillo de 2 px blanco uniforme (baja dispersión) + contenido >98% del área.
    const img = buffer(500, 500, [255, 255, 255, 255]);
    for (let y = 2; y < 498; y += 1) {
      for (let x = 2; x < 498; x += 1) {
        setPx(img, x, y, [0, 0, 0, 255]);
      }
    }
    const bbox = computeContentBBox(img);
    expect(bbox?.reason).toBe('sin-margen');
  });

  it('el padding usa el lado menor (no se come logos apaisados)', () => {
    const expanded = expandBBox({ x: 50, y: 30, w: 2100, h: 340 }, 2300, 500, 0.02);
    // pad = min(64, max(2, round(340 * 0.02))) = 7
    expect(expanded.h).toBe(340 + 14);
    expect(expanded.w).toBe(2100 + 14);
  });

  it('la curva de niveles conserva valores intermedios', () => {
    const img = buffer(2, 2, [148, 148, 148, 255]);
    applyLevels(img, 60, 235);
    const mid = img.data[0];
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(160);
    expect(mid).not.toBe(0);
    expect(mid).not.toBe(255);
  });
});
