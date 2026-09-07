import { describe, expect, it } from 'vitest';
import { applyAspectRatioLock, resolveFabricationSize } from './fabricationSize';

describe('resolveFabricationSize', () => {
  it('50×10 pedido, medido 50×8.8 (planchuela 12, tope 11.5) → needsReview false, guarda 50×8.8', () => {
    const result = resolveFabricationSize(50, 10, { widthMm: 50, heightMm: 8.8 });
    expect(result.tipoPlanchuela).toBe(12);
    expect(result.maxUsableMm).toBe(11.5);
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBeCloseTo(50, 5);
    expect(result.heightMm).toBeCloseTo(8.8, 5);
  });

  it('40×40 medido ~40×40 (planchuela 38, tope 36.5) → needsReview true, ~36.5×36.5', () => {
    const result = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 40 });
    expect(result.tipoPlanchuela).toBe(38);
    expect(result.maxUsableMm).toBe(36.5);
    expect(result.needsReview).toBe(true);
    expect(result.widthMm).toBeCloseTo(36.5, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
  });

  it('50×20 medido 50×20 (planchuela 19, tope 18) → needsReview true, 50×18', () => {
    const result = resolveFabricationSize(50, 20, { widthMm: 50, heightMm: 20 });
    expect(result.tipoPlanchuela).toBe(19);
    expect(result.maxUsableMm).toBe(18);
    expect(result.needsReview).toBe(true);
    expect(result.heightMm).toBeCloseTo(18, 5);
    expect(result.widthMm).toBeCloseTo(50, 5);
  });

  it('22×21 planchuela 25, medido por debajo del tope 24 → needsReview false', () => {
    const result = resolveFabricationSize(22, 21, { widthMm: 22, heightMm: 21 });
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.maxUsableMm).toBe(24);
    expect(result.needsReview).toBe(false);
    expect(result.widthMm).toBe(22);
    expect(result.heightMm).toBe(21);
  });

  it('25×25 medido 25×25 (planchuela 25, tope 24) → needsReview true, 24×24', () => {
    const result = resolveFabricationSize(25, 25, { widthMm: 25, heightMm: 25 });
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.maxUsableMm).toBe(24);
    expect(result.needsReview).toBe(true);
    expect(result.widthMm).toBeCloseTo(24, 5);
    expect(result.heightMm).toBeCloseTo(24, 5);
  });

  it('40×25 medido 40×25 (planchuela 25, tope 24) → needsReview true, proporcional ×24', () => {
    const result = resolveFabricationSize(40, 25, { widthMm: 40, heightMm: 25 });
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.needsReview).toBe(true);
    expect(result.heightMm).toBeCloseTo(24, 5);
    expect(result.widthMm).toBeCloseTo(24 * (40 / 25), 5);
  });

  it('sin medición y pedido que excede tope → needsReview true con proporción pedida', () => {
    const result = resolveFabricationSize(40, 40, null);
    expect(result.needsReview).toBe(true);
    expect(result.widthMm).toBeCloseTo(36.5, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
  });
});

describe('applyAspectRatioLock', () => {
  it('recalcula alto al cambiar ancho', () => {
    expect(applyAspectRatioLock('width', 40, 2)).toEqual({ widthMm: 40, heightMm: 20 });
  });

  it('recalcula ancho al cambiar alto', () => {
    expect(applyAspectRatioLock('height', 18, 50 / 18)).toEqual({
      widthMm: 50,
      heightMm: 18,
    });
  });
});
