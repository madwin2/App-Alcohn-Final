import { describe, expect, it } from 'vitest';
import { containSize } from './svgSize';

describe('containSize', () => {
  it('diseño acostado en pedido 50×10 → 50×10', () => {
    expect(containSize(500, 100, 50, 10)).toEqual({ widthMm: 50, heightMm: 10 });
  });

  it('diseño parado en pedido 50×10 → 10 de ancho × 50 de alto (no 2×10)', () => {
    expect(containSize(100, 500, 50, 10)).toEqual({ widthMm: 10, heightMm: 50 });
  });

  it('diseño parado más angosto que lo pedido → entra por el alto', () => {
    const r = containSize(100, 1000, 50, 10);
    expect(r.heightMm).toBeCloseTo(50, 6);
    expect(r.widthMm).toBeCloseTo(5, 6);
  });

  it('diseño o pedido cuadrado → sin cambios', () => {
    expect(containSize(100, 100, 50, 10)).toEqual({ widthMm: 10, heightMm: 10 });
    expect(containSize(100, 500, 40, 40)).toEqual({ widthMm: 8, heightMm: 40 });
  });
});
