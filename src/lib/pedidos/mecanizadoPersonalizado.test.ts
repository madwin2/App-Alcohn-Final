import { describe, expect, it } from 'vitest';
import { describeMecanizado, MECANIZADO_DEFAULT, parseDepthInput, readMecanizado } from './mecanizadoPersonalizado';

describe('mecanizado personalizado', () => {
  it('sin datos usa los valores de Clásico', () => {
    expect(readMecanizado(undefined)).toEqual(MECANIZADO_DEFAULT);
    expect(readMecanizado({ rosca: 'M8', grabadoDepthMm: -1, exteriorDepthMm: 'x' })).toEqual(MECANIZADO_DEFAULT);
  });

  it('conserva lo guardado', () => {
    const m = { rosca: 'SIN_ROSCA', exteriorDepthMm: 4, grabadoDepthMm: 1, perfiladoRecto1mm: true };
    expect(readMecanizado(m)).toEqual(m);
  });

  it('acepta coma decimal y rechaza valores fuera de rango', () => {
    expect(parseDepthInput('1,7')).toBe(1.7);
    expect(parseDepthInput(' ')).toBeNull();
    expect(parseDepthInput('0')).toBe('invalid');
    expect(parseDepthInput('12')).toBe('invalid');
    expect(parseDepthInput('abc')).toBe('invalid');
  });

  it('resume la configuración', () => {
    expect(describeMecanizado({ rosca: 'M4', exteriorDepthMm: null, grabadoDepthMm: 0.6, perfiladoRecto1mm: true }))
      .toBe('Rosca M4 · Exterior como Clásico · Grabado 0,6 mm · Perfilado recto 1 mm');
  });
});
