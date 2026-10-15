import { describe, expect, it } from 'vitest';
import { FRESA_FINA } from './config';
import { distanceToBlack, shadeRelief, vcarveDepth } from './vcarveRelief';

describe('relieve del V-carve', () => {
  it('distancia exacta al negro (Felzenszwalb)', () => {
    // Grilla 7×1 con negro en la punta izquierda.
    const black = new Uint8Array([1, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(distanceToBlack(black, 7, 1))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Diagonal en 2D.
    const b2 = new Uint8Array(25);
    b2[0] = 1;
    expect(distanceToBlack(b2, 5, 5)[4 * 5 + 3]).toBeCloseTo(5, 6);
  });

  it('la profundidad crece con el ancho del canal y tiene tope en la final', () => {
    // Canal de 41 celdas de 0,01 mm (0,41 mm) entre dos paredes negras.
    const w = 43;
    const black = new Uint8Array(w);
    black[0] = 1;
    black[w - 1] = 1;
    const depth = vcarveDepth(distanceToBlack(black, w, 1), 0.01, FRESA_FINA);
    const mid = depth[21];
    // Mitad del canal ≈ 0,2 mm → 0,2 / tan 30° ≈ 0,35 mm.
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.4);
    expect(depth[0]).toBe(0);
    // Un canal ancho se corta en la profundidad final (0,6 mm).
    const wide = new Uint8Array(400);
    wide[0] = 1;
    const d2 = vcarveDepth(distanceToBlack(wide, 400, 1), 0.01, FRESA_FINA);
    expect(Math.max(...d2)).toBeCloseTo(FRESA_FINA.finalDepthMm, 6);
  });

  it('el sombreado devuelve una imagen opaca del tamaño de la grilla', () => {
    const depth = new Float32Array([0, 0.3, 0.6, 0.6]);
    const img = shadeRelief(depth, 2, 2, 0.05, 0.6);
    expect(img.length).toBe(16);
    expect(img[3]).toBe(255);
    // Lo más hondo es más oscuro que lo de arriba.
    expect(img[0] + img[1] + img[2]).toBeGreaterThan(img[12] + img[13] + img[14]);
  });
});
