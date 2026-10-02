import { describe, expect, it } from 'vitest';
import { COLORES_EQUIPO, colorYaUsado, esColorValido } from './colores';

describe('colores equipo', () => {
  it('tiene 10 colores distintos', () => {
    expect(COLORES_EQUIPO).toHaveLength(10);
    expect(new Set(COLORES_EQUIPO).size).toBe(10);
  });

  it('valida hex de 6 dígitos', () => {
    expect(esColorValido('#EF4444')).toBe(true);
    expect(esColorValido('#ef4444')).toBe(true);
    expect(esColorValido('#FFF')).toBe(false);
    expect(esColorValido('red')).toBe(false);
  });

  it('detecta color ya usado (case-insensitive)', () => {
    expect(colorYaUsado('#EF4444', ['#3B82F6', '#ef4444'])).toBe(true);
    expect(colorYaUsado('#EF4444', ['#3B82F6'])).toBe(false);
  });
});
