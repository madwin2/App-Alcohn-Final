import { describe, expect, it } from 'vitest';
import {
  calcularAntiguedad,
  calcularYFormatearAntiguedad,
  formatearAntiguedad,
} from './antiguedad';

describe('calcularAntiguedad', () => {
  it('cuenta años y meses exactos', () => {
    expect(calcularAntiguedad('2023-08-03', '2025-10-02')).toEqual({
      anios: 2,
      meses: 1,
      dias: 29,
    });
  });

  it('ingresó hoy', () => {
    expect(calcularAntiguedad('2026-10-02', '2026-10-02')).toEqual({
      anios: 0,
      meses: 0,
      dias: 0,
    });
  });

  it('solo meses', () => {
    expect(calcularAntiguedad('2026-06-01', '2026-10-02')).toEqual({
      anios: 0,
      meses: 4,
      dias: 1,
    });
  });

  it('fecha de ingreso futura → cero', () => {
    expect(calcularAntiguedad('2027-01-01', '2026-10-02')).toEqual({
      anios: 0,
      meses: 0,
      dias: 0,
    });
  });
});

describe('formatearAntiguedad', () => {
  it('formatea años y meses', () => {
    expect(formatearAntiguedad({ anios: 2, meses: 3, dias: 0 })).toBe('2 años y 3 meses');
  });

  it('formatea solo meses', () => {
    expect(formatearAntiguedad({ anios: 0, meses: 4, dias: 2 })).toBe('4 meses');
  });

  it('ingresó hoy', () => {
    expect(formatearAntiguedad({ anios: 0, meses: 0, dias: 0 })).toBe('Ingresó hoy');
  });

  it('singular de año', () => {
    expect(formatearAntiguedad({ anios: 1, meses: 0, dias: 0 })).toBe('1 año');
  });

  it('helpers combinados', () => {
    expect(calcularYFormatearAntiguedad('2024-06-15', '2026-10-02')).toBe('2 años y 3 meses');
  });
});
