import { describe, expect, it } from 'vitest';
import {
  applyAspectRatioLock,
  clampToTopePreservingAspect,
  fitAspectInBox,
  resolveFabricationSize,
  scaleMinorSideToTope,
} from './fabricationSize';

describe('resolveFabricationSize', () => {
  it('50×10 pedido, medido 50×8.8 (planchuela 12) → needsReview false, guarda 50×8.8', () => {
    const result = resolveFabricationSize(50, 10, { widthMm: 50, heightMm: 8.8 });
    expect(result.tipoPlanchuela).toBe(12);
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(8.8, 5);
  });

  it('50×29 pedido, SVG 61.9×36.5 → popup sugiriendo el vector (sin deformar)', () => {
    const result = resolveFabricationSize(50, 29, { widthMm: 61.9, heightMm: 36.5 });
    expect(result.tipoPlanchuela).toBe(38);
    expect(result.needsReview).toBe(true);
    expect(result.widthMm).toBeCloseTo(61.9, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
    expect(result.widthMm / result.heightMm).toBeCloseTo(61.9 / 36.5, 5);
  });

  it('40×40 medido 40×40 (tope 36.5) → 36.5×36.5 sin popup', () => {
    const result = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 40 });
    expect(result.needsReview).toBe(false);
    expect(result.reviewReason).toBe(null);
    expect(result.widthMm).toBeCloseTo(36.5, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
  });

  it('50×20 medido 50×20 → planchuela 25 (tope 24), entra sin popup', () => {
    const result = resolveFabricationSize(50, 20, { widthMm: 50, heightMm: 20 });
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(20, 5);
  });

  it('50×18 medido 50×19 (tope 18 de planchuela 19) → recorta al tope', () => {
    const result = resolveFabricationSize(50, 18, { widthMm: 50, heightMm: 19 });
    expect(result.tipoPlanchuela).toBe(19);
    expect(result.needsReview).toBe(true);
    expect(result.heightMm).toBeCloseTo(18, 5);
    expect(result.widthMm).toBeCloseTo(18 * (50 / 19), 5);
  });

  it('25×11 pedido, medido 23.3×11.6 (tope 11.5) → sugiere ~23.1×11.5 sin deformar', () => {
    const result = resolveFabricationSize(25, 11, { widthMm: 23.3, heightMm: 11.6 });
    expect(result.needsReview).toBe(true);
    expect(result.reviewReason).toBe('exceeds_tope');
    expect(result.heightMm).toBeCloseTo(11.5, 5);
    expect(result.widthMm).toBeCloseTo(11.5 * (23.3 / 11.6), 5);
    expect(result.widthMm / result.heightMm).toBeCloseTo(23.3 / 11.6, 5);
  });

  it('50×5 pedido, medido 56×7 → diferencia ≥6mm abre popup con el vector medido', () => {
    const result = resolveFabricationSize(50, 5, { widthMm: 56, heightMm: 7 });
    expect(result.needsReview).toBe(true);
    expect(result.reviewReason).toBe('large_diff');
    expect(result.widthMm).toBeCloseTo(56, 5);
    expect(result.heightMm).toBeCloseTo(7, 5);
  });

  it('diferencia menor a 6mm y dentro del tope → sin popup', () => {
    const result = resolveFabricationSize(50, 20, { widthMm: 52, heightMm: 18 });
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(52, 5);
    expect(result.heightMm).toBeCloseTo(18, 5);
  });

  it('25×25 medido 25×25 → 24×24 sin popup', () => {
    const result = resolveFabricationSize(25, 25, { widthMm: 25, heightMm: 25 });
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(24, 5);
    expect(result.heightMm).toBeCloseTo(24, 5);
  });

  it('40×40 pedido, vector 40×32 → lado chico a 36.5, largo 45.625, sin popup', () => {
    const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 32 });
    expect(r.tipoPlanchuela).toBe(38);
    expect(r.needsReview).toBe(false);
    expect(r.heightMm).toBeCloseTo(36.5, 5);
    expect(r.widthMm).toBeCloseTo(36.5 * (40 / 32), 5);
  });

  it('40×40 pedido, vector 40×36.4 → 40.1×36.5 sin popup (agranda apenas)', () => {
    const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 36.4 });
    expect(r.needsReview).toBe(false);
    expect(r.heightMm).toBeCloseTo(36.5, 5);
    expect(r.widthMm).toBeCloseTo(36.5 * (40 / 36.4), 5);
  });

  it('40×40 pedido, vector 2:1 (40×20) → 73×36.5 con popup tope_long_side_diff', () => {
    const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 20 });
    expect(r.needsReview).toBe(true);
    expect(r.reviewReason).toBe('tope_long_side_diff');
    expect(r.heightMm).toBeCloseTo(36.5, 5);
    expect(r.widthMm).toBeCloseTo(73, 5);
  });

  it('vector vertical (32×40) en pedido 40×40 → el lado chico (ancho) va a 36.5', () => {
    const r = resolveFabricationSize(40, 40, { widthMm: 32, heightMm: 40 });
    expect(r.widthMm).toBeCloseTo(36.5, 5);
    expect(r.heightMm).toBeCloseTo(36.5 * (40 / 32), 5);
  });

  it('40×30 pedido (lado menor 30 < tope) → NO aplica la regla nueva', () => {
    const r = resolveFabricationSize(40, 30, { widthMm: 40, heightMm: 30 });
    expect(r.needsReview).toBe(false);
    expect(r.widthMm).toBeCloseTo(40, 5);
    expect(r.heightMm).toBeCloseTo(30, 5);
  });

  it('scaleMinorSideToTope agranda y achica', () => {
    expect(scaleMinorSideToTope(40, 32, 36.5).heightMm).toBeCloseTo(36.5, 5);
    expect(scaleMinorSideToTope(50, 40, 36.5).heightMm).toBeCloseTo(36.5, 5);
    expect(scaleMinorSideToTope(10, 10, null)).toEqual({ widthMm: 10, heightMm: 10 });
  });
});

describe('clampToTopePreservingAspect / fitAspectInBox', () => {
  it('no cambia si ya entra en el tope', () => {
    expect(clampToTopePreservingAspect(20, 10, 11.5)).toEqual({ widthMm: 20, heightMm: 10 });
  });

  it('encaja proporción en la caja pedida', () => {
    const fitted = fitAspectInBox(23.3 / 11.6, 25, 11);
    expect(fitted.heightMm).toBeCloseTo(11, 5);
    expect(fitted.widthMm).toBeCloseTo(11 * (23.3 / 11.6), 5);
  });
});

describe('applyAspectRatioLock', () => {
  it('recalcula alto al cambiar ancho', () => {
    expect(applyAspectRatioLock('width', 40, 2)).toEqual({ widthMm: 40, heightMm: 20 });
  });
});
