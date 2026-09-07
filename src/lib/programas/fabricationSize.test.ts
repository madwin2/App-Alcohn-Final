import { describe, expect, it } from 'vitest';
import { applyAspectRatioLock, resolveFabricationSize } from './fabricationSize';

describe('resolveFabricationSize', () => {
  it('50×10 pedido, medido 50×8.8 (planchuela 12) → needsReview false, guarda 50×8.8', () => {
    const result = resolveFabricationSize(50, 10, { widthMm: 50, heightMm: 8.8 });
    expect(result.tipoPlanchuela).toBe(12);
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(8.8, 5);
  });

  it('50×29 pedido, SVG más grande que tope 36.5 → popup con medida pedida 50×29', () => {
    const result = resolveFabricationSize(50, 29, { widthMm: 61.9, heightMm: 36.5 });
    expect(result.tipoPlanchuela).toBe(38);
    expect(result.needsReview).toBe(true);
    expect(result.reviewReason).toBe('exceeds_tope');
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(29, 5);
  });

  it('40×40 medido 40×40 (tope 36.5) → needsReview true, sugiere 36.5×36.5 desde lo pedido', () => {
    const result = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 40 });
    expect(result.needsReview).toBe(true);
    expect(result.reviewReason).toBe('exceeds_tope');
    expect(result.widthMm).toBeCloseTo(36.5, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
  });

  it('50×20 medido 50×20 (tope 18) → sugiere pedido recortado proporcional al tope', () => {
    const result = resolveFabricationSize(50, 20, { widthMm: 50, heightMm: 20 });
    expect(result.needsReview).toBe(true);
    expect(result.heightMm).toBeCloseTo(18, 5);
    expect(result.widthMm).toBeCloseTo(18 * (50 / 20), 5);
  });

  it('50×5 pedido, medido 56×7 → diferencia ≥6mm abre popup con medida pedida', () => {
    const result = resolveFabricationSize(50, 5, { widthMm: 56, heightMm: 7 });
    expect(result.needsReview).toBe(true);
    expect(result.reviewReason).toBe('large_diff');
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(5, 5);
  });

  it('diferencia menor a 6mm y dentro del tope → sin popup', () => {
    const result = resolveFabricationSize(50, 20, { widthMm: 52, heightMm: 18 });
    // planchuela 19 tope 18; minor medido 18 <= 18.05 → no exceeds; diffs 2 y 2 < 6
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(52, 5);
    expect(result.heightMm).toBeCloseTo(18, 5);
  });

  it('25×25 medido 25×25 → sugiere 24×24', () => {
    const result = resolveFabricationSize(25, 25, { widthMm: 25, heightMm: 25 });
    expect(result.needsReview).toBe(true);
    expect(result.widthMm).toBeCloseTo(24, 5);
    expect(result.heightMm).toBeCloseTo(24, 5);
  });
});

describe('applyAspectRatioLock', () => {
  it('recalcula alto al cambiar ancho', () => {
    expect(applyAspectRatioLock('width', 40, 2)).toEqual({ widthMm: 40, heightMm: 20 });
  });
});
