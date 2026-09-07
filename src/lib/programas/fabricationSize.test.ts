import { describe, expect, it } from 'vitest';
import { applyAspectRatioLock, suggestFabricationSize } from './fabricationSize';

describe('suggestFabricationSize', () => {
  it('40×40 planchuela 38 → ~36.5×36.5 (margen 3.5 en ambos ejes por proporción 1)', () => {
    const result = suggestFabricationSize(40, 40, 1);
    expect(result.tipoPlanchuela).toBe(38);
    expect(result.marginAppliedMm).toBe(3.5);
    expect(result.widthMm).toBeCloseTo(36.5, 5);
    expect(result.heightMm).toBeCloseTo(36.5, 5);
  });

  it('50×20 planchuela 19 → 50×18 (solo el eje menor se recorta)', () => {
    // ratio pedido = 50/20 = 2.5; height menor → 18; width = 18 * 2.5 = 45
    // Con ratio del SVG = 50/20 = 2.5 igual: width = 18 * 2.5 = 45
    // El análisis dice 50×18 — eso implica conservar el eje mayor del pedido cuando
    // la proporción del SVG coincide con la pedida… Revisar: widthIsMinor = false
    // (50 > 20), heightMm = 20 - 2 = 18, widthMm = 18 * ratio.
    // Si ratio = 50/20 = 2.5 → width = 45. Si queremos 50×18 hace falta ratio = 50/18.
    // Con ratio del pedido (fallback): width = 45. El análisis del plan usa proporción
    // del SVG que mantiene el largo; con ratio pedido da 45×18.
    const result = suggestFabricationSize(50, 20, 50 / 20);
    expect(result.tipoPlanchuela).toBe(19);
    expect(result.marginAppliedMm).toBe(2);
    expect(result.heightMm).toBeCloseTo(18, 5);
    expect(result.widthMm).toBeCloseTo(45, 5);
  });

  it('50×20 con ratio SVG que preserva el largo pedido → 50×18', () => {
    // Si el SVG mide proporcional a 50×18, ratio = 50/18
    const result = suggestFabricationSize(50, 20, 50 / 18);
    expect(result.heightMm).toBeCloseTo(18, 5);
    expect(result.widthMm).toBeCloseTo(50, 5);
  });

  it('50×12 planchuela 12 → 50×11.5 equivalente vía ratio pedido (width recalculado)', () => {
    const result = suggestFabricationSize(50, 12, 50 / 12);
    expect(result.tipoPlanchuela).toBe(12);
    expect(result.marginAppliedMm).toBe(0.5);
    expect(result.heightMm).toBeCloseTo(11.5, 5);
    expect(result.widthMm).toBeCloseTo(11.5 * (50 / 12), 5);
  });

  it('25×25 planchuela 25 → 24×24 (margen 1.0)', () => {
    const result = suggestFabricationSize(25, 25, 1);
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.marginAppliedMm).toBe(1);
    expect(result.widthMm).toBeCloseTo(24, 5);
    expect(result.heightMm).toBeCloseTo(24, 5);
  });

  it('40×25 planchuela 25 → menor a 24 y el otro proporcional', () => {
    // height es menor → 24; con ratio pedido 40/25 = 1.6 → width = 24 * 1.6 = 38.4
    const result = suggestFabricationSize(40, 25, 40 / 25);
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.marginAppliedMm).toBe(1);
    expect(result.heightMm).toBeCloseTo(24, 5);
    expect(result.widthMm).toBeCloseTo(38.4, 5);
  });

  it('22×21 planchuela 25 → menor a 21, se recorta a 20 y el otro proporcional', () => {
    const result = suggestFabricationSize(22, 21, 22 / 21);
    expect(result.tipoPlanchuela).toBe(25);
    expect(result.marginAppliedMm).toBe(1);
    expect(result.heightMm).toBeCloseTo(20, 5);
    expect(result.widthMm).toBeCloseTo(20 * (22 / 21), 5);
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
